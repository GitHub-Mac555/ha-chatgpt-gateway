import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { entityParamsSchema } from '../schemas/entity.js';
import { getEntityDomain, isDomainAllowed, isEntityAllowed } from '../security/authorization.js';

const entityQuerySchema = z.object({
  domain: z.string().min(1).max(128).transform((value) => value.toLowerCase()).optional(),
});

export async function registerEntityRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  client: HomeAssistantClient,
): Promise<void> {
  app.get('/api/v1/entities', async (request, reply) => {
    const queryResult = entityQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: queryResult.error.issues });
    }

    const domain = queryResult.data.domain;
    if (domain && !isDomainAllowed(config, domain)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Domain is not allowed.' });
    }

    const states = await client.getStates();
    const entities = states.filter((state) => {
      if (!isEntityAllowed(config, state.entity_id)) {
        return false;
      }
      return !domain || getEntityDomain(state.entity_id) === domain;
    });

    return { entities };
  });

  app.get('/api/v1/entities/:entityId', async (request, reply) => {
    const paramsResult = entityParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: paramsResult.error.issues });
    }

    const { entityId } = paramsResult.data;
    if (!isEntityAllowed(config, entityId)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Entity is not allowed.' });
    }

    return client.getState(entityId);
  });

  app.get('/api/v1/entities/:entityId/state', async (request, reply) => {
    const paramsResult = entityParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: paramsResult.error.issues });
    }

    const { entityId } = paramsResult.data;
    if (!isEntityAllowed(config, entityId)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Entity is not allowed.' });
    }

    const state = await client.getState(entityId);
    return {
      entity_id: state.entity_id,
      state: state.state,
      last_changed: state.last_changed,
      last_updated: state.last_updated,
    };
  });
}
