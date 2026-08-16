import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import type { HomeAssistantServiceDomain } from '../home-assistant/types.js';
import {
  resolveServiceData,
  serviceBatchSchema,
  serviceCallSchema,
  type ActionServiceCallInput,
  type ServiceCallInput,
} from '../schemas/service.js';
import { getEntityDomain, isDomainAllowed, isEntityAllowed } from '../security/authorization.js';
import {
  resolveServiceEntityTargets,
  type TargetResolutionFailure,
} from '../security/target-resolution.js';
import { invalidRequest } from '../http/errors.js';
import { hasGatewayScope } from '../security/authentication.js';
import { createServiceRateLimitHook } from '../security/rate-limit.js';
import { buildServiceTargetPolicy } from '../security/service-target-policy.js';

type PreparedServiceCall = {
  domain: string;
  service: string;
  entity_id: string | string[];
  data?: Record<string, unknown>;
  returnResponse: boolean;
};

type ServiceInput = ServiceCallInput | ActionServiceCallInput;

function validateBasicServiceInput(
  input: ServiceInput,
  config: GatewayConfig,
): { statusCode?: number; error?: string; message?: string } {
  if (!isDomainAllowed(config, input.domain)) {
    return { statusCode: 403, error: 'forbidden', message: 'Domain is not allowed.' };
  }
  const dataResult = resolveServiceData(input);
  if (dataResult.error) {
    return { statusCode: 400, error: 'invalid_request', message: dataResult.error };
  }
  return {};
}

async function prepareServiceCall(
  input: ServiceInput,
  config: GatewayConfig,
  client: HomeAssistantClient,
  services: HomeAssistantServiceDomain[],
): Promise<{ call?: PreparedServiceCall; statusCode?: number; error?: string; message?: string }> {
  const basicValidation = validateBasicServiceInput(input, config);
  if (basicValidation.statusCode) return basicValidation;

  const definition = client.getServiceDefinition(services, input.domain, input.service);
  if (!definition) {
    return {
      statusCode: 404,
      error: 'not_found',
      message: 'The requested Home Assistant service was not found.',
    };
  }
  const targetPolicy = buildServiceTargetPolicy(input.domain, definition);
  if (targetPolicy.targetDomains.size === 0) {
    return {
      statusCode: 403,
      error: 'forbidden',
      message: 'This Home Assistant service does not have an explicit entity target.',
    };
  }

  const target = 'target' in input ? input.target : undefined;
  const unsupportedTargets = (['device_id', 'area_id', 'label_id'] as const).filter(
    (key) => target?.[key]?.length,
  );
  if (unsupportedTargets.length > 0) {
    return {
      statusCode: 403,
      error: 'forbidden',
      message: `Unsupported target type: ${unsupportedTargets.join(', ')}. Use explicit entity_id targets.`,
    };
  }

  const targetEntityIds = input.entity_id ?? target?.entity_id;
  if (!targetEntityIds) {
    return {
      statusCode: 403,
      error: 'forbidden',
      message: 'An explicit entity_id target is required by the gateway policy.',
    };
  }
  const entityIds = Array.isArray(targetEntityIds) ? targetEntityIds : [targetEntityIds];

  if (
    entityIds.some((entityId) => !targetPolicy.targetDomains.has(getEntityDomain(entityId) ?? ''))
  ) {
    return {
      statusCode: 400,
      error: 'invalid_request',
      message: 'One or more entity_id values are not valid targets for this service.',
    };
  }

  if (entityIds.some((entityId) => !isEntityAllowed(config, entityId))) {
    return {
      statusCode: 403,
      error: 'forbidden',
      message: 'One or more entities are not allowed.',
    };
  }

  const dataResult = resolveServiceData(input);

  const data = dataResult.data ? { ...dataResult.data } : undefined;
  for (const [fieldName, fieldPolicy] of targetPolicy.dataEntityFields) {
    if (!data) break;
    const value = data[fieldName];
    if (value === undefined) continue;
    const submittedValues =
      typeof value === 'string'
        ? [value]
        : Array.isArray(value) && value.every((item) => typeof item === 'string')
          ? value
          : undefined;
    if (!submittedValues || submittedValues.length === 0) {
      return {
        statusCode: 400,
        error: 'invalid_request',
        message: `Service data field ${fieldName} must contain one or more entity_id values.`,
      };
    }
    if (!fieldPolicy.multiple && submittedValues.length !== 1) {
      return {
        statusCode: 400,
        error: 'invalid_request',
        message: `Service data field ${fieldName} accepts one entity_id value.`,
      };
    }
    const allowedDomains =
      fieldPolicy.allowedDomains.size > 0 ? fieldPolicy.allowedDomains : config.allowedDomains;
    const resolved = await resolveServiceEntityTargets(
      client,
      config,
      allowedDomains,
      submittedValues,
    );
    if ('error' in resolved) return resolved;
    if (typeof value === 'string') {
      if (resolved.entityIds.length !== 1) {
        return {
          statusCode: 400,
          error: 'invalid_request',
          message: `Service data field ${fieldName} cannot expand one entity_id into multiple targets.`,
        };
      }
      data[fieldName] = resolved.entityIds[0];
    } else {
      data[fieldName] = resolved.entityIds;
    }
  }

  const resolvedTargets = await resolveServiceEntityTargets(
    client,
    config,
    targetPolicy.targetDomains,
    entityIds,
  );
  if ('error' in resolvedTargets) {
    const targetFailure: TargetResolutionFailure = resolvedTargets;
    return targetFailure;
  }

  return {
    call: {
      domain: input.domain,
      service: input.service,
      entity_id:
        typeof input.entity_id === 'string' && resolvedTargets.entityIds.length === 1
          ? (resolvedTargets.entityIds[0] ?? resolvedTargets.entityIds)
          : resolvedTargets.entityIds,
      data,
      // Home Assistant rejects response-only services without this flag. Do
      // not request it for optional/non-response services: HA rejects that as
      // well when a service does not support responses.
      returnResponse: definition.response?.optional === false,
    },
  };
}

function sendPreparedCallError(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  result: Awaited<ReturnType<typeof prepareServiceCall>>,
) {
  return reply.code(result.statusCode ?? 400).send({
    error: result.error ?? 'invalid_request',
    message: result.message ?? 'Invalid service call.',
  });
}

export async function registerServiceRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  client: HomeAssistantClient,
): Promise<void> {
  const rateLimitServiceCall = createServiceRateLimitHook(config);

  app.post('/api/v1/services/call', async (request, reply) => {
    if (!hasGatewayScope(request, 'write')) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'This gateway API key does not have write scope.',
      });
    }
    await rateLimitServiceCall(request, reply);
    if (reply.sent) return;

    if (config.readOnly) {
      return reply.code(403).send({
        error: 'read_only',
        message: 'Service calls are disabled because READ_ONLY=true.',
      });
    }

    const bodyResult = serviceCallSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send(invalidRequest(bodyResult.error.issues));
    }

    const basicValidation = validateBasicServiceInput(bodyResult.data, config);
    if (basicValidation.statusCode) return sendPreparedCallError(reply, basicValidation);

    const services = await client.getServices();
    const prepared = await prepareServiceCall(bodyResult.data, config, client, services);
    if (!prepared.call) return sendPreparedCallError(reply, prepared);

    const result = await client.callService(prepared.call);
    return { ok: true, result };
  });

  app.post('/api/v1/services/batch', async (request, reply) => {
    if (!hasGatewayScope(request, 'write')) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'This gateway API key does not have write scope.',
      });
    }
    await rateLimitServiceCall(request, reply);
    if (reply.sent) return;

    if (config.readOnly) {
      return reply.code(403).send({
        error: 'read_only',
        message: 'Service calls are disabled because READ_ONLY=true.',
      });
    }

    const bodyResult = serviceBatchSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send(invalidRequest(bodyResult.error.issues));
    }

    // Validate the complete batch before any Home Assistant state can change.
    for (const input of bodyResult.data.calls) {
      const basicValidation = validateBasicServiceInput(input, config);
      if (basicValidation.statusCode) return sendPreparedCallError(reply, basicValidation);
    }

    const services = await client.getServices();
    const calls: PreparedServiceCall[] = [];
    for (const input of bodyResult.data.calls) {
      const prepared = await prepareServiceCall(input, config, client, services);
      if (!prepared.call) return sendPreparedCallError(reply, prepared);
      calls.push(prepared.call);
    }

    const results: unknown[] = [];
    for (const call of calls) {
      // This is deliberately sequential and stops on an upstream error. Home
      // Assistant has no generic transaction/rollback facility for services.
      results.push(await client.callService(call));
    }

    return { ok: true, results };
  });
}
