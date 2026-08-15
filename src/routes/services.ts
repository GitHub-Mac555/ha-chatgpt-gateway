import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { serviceCallSchema } from '../schemas/service.js';
import { getEntityDomain, isDomainAllowed, isEntityAllowed } from '../security/authorization.js';
import { invalidRequest } from '../http/errors.js';

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

    const input = bodyResult.data;
    if (!isDomainAllowed(config, input.domain)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Domain is not allowed.' });
    }

    const unsupportedTargets = (['device_id', 'area_id', 'label_id'] as const).filter(
      (key) => input.target?.[key]?.length,
    );
    if (unsupportedTargets.length > 0) {
      return reply.code(403).send({
        error: 'forbidden',
        message: `Unsupported target type: ${unsupportedTargets.join(', ')}. Use explicit entity_id targets.`,
      });
    }

    const targetEntityIds = input.entity_id ?? input.target?.entity_id;
    if (!targetEntityIds) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'An explicit entity_id target is required by the gateway policy.',
      });
    }
    const entityIds = Array.isArray(targetEntityIds) ? targetEntityIds : [targetEntityIds];

    if (entityIds.some((entityId) => getEntityDomain(entityId) !== input.domain)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Every entity_id domain must match the service domain.',
      });
    }

    if (entityIds.some((entityId) => !isEntityAllowed(config, entityId))) {
      return reply
        .code(403)
        .send({ error: 'forbidden', message: 'One or more entities are not allowed.' });
    }

    const result = await client.callService({ ...input, entity_id: targetEntityIds });
    return { ok: true, result };
  });
}
