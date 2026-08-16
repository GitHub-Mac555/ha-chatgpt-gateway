import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import {
  resolveServiceData,
  serviceBatchSchema,
  serviceCallSchema,
  type ActionServiceCallInput,
  type ServiceCallInput,
} from '../schemas/service.js';
import { getEntityDomain, isDomainAllowed, isEntityAllowed } from '../security/authorization.js';
import { invalidRequest } from '../http/errors.js';

type PreparedServiceCall = {
  domain: string;
  service: string;
  entity_id: string | string[];
  data?: Record<string, unknown>;
};

type ServiceInput = ServiceCallInput | ActionServiceCallInput;

function prepareServiceCall(
  input: ServiceInput,
  config: GatewayConfig,
): { call?: PreparedServiceCall; statusCode?: number; error?: string; message?: string } {
  if (!isDomainAllowed(config, input.domain)) {
    return { statusCode: 403, error: 'forbidden', message: 'Domain is not allowed.' };
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

  if (entityIds.some((entityId) => getEntityDomain(entityId) !== input.domain)) {
    return {
      statusCode: 400,
      error: 'invalid_request',
      message: 'Every entity_id domain must match the service domain.',
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
  if (dataResult.error) {
    return { statusCode: 400, error: 'invalid_request', message: dataResult.error };
  }

  return {
    call: {
      domain: input.domain,
      service: input.service,
      entity_id: targetEntityIds,
      data: dataResult.data,
    },
  };
}

function sendPreparedCallError(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  result: ReturnType<typeof prepareServiceCall>,
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
  app.post('/api/v1/services/call', async (request, reply) => {
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

    const prepared = prepareServiceCall(bodyResult.data, config);
    if (!prepared.call) return sendPreparedCallError(reply, prepared);

    const result = await client.callService(prepared.call);
    return { ok: true, result };
  });

  app.post('/api/v1/services/batch', async (request, reply) => {
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
    const calls: PreparedServiceCall[] = [];
    for (const input of bodyResult.data.calls) {
      const prepared = prepareServiceCall(input, config);
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
