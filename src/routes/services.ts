import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { serviceCallSchema } from '../schemas/service.js';
import { getEntityDomain, isDomainAllowed, isEntityAllowed } from '../security/authorization.js';

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
      return reply.code(400).send({ error: 'invalid_request', issues: bodyResult.error.issues });
    }

    const input = bodyResult.data;
    if (!isDomainAllowed(config, input.domain)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Domain is not allowed.' });
    }

    const entityIds = Array.isArray(input.entity_id) ? input.entity_id : [input.entity_id];

    if (entityIds.some((entityId) => getEntityDomain(entityId) !== input.domain)) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Every entity_id domain must match the service domain.',
      });
    }

    if (entityIds.some((entityId) => !isEntityAllowed(config, entityId))) {
      return reply.code(403).send({ error: 'forbidden', message: 'One or more entities are not allowed.' });
    }

    const result = await client.callService(input);
    return { ok: true, result };
  });
}
