import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { z } from 'zod';
import { invalidRequest } from '../http/errors.js';
import { isEntityAllowed } from '../security/authorization.js';

const serviceQuerySchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(128)
    .transform((value) => value.toLowerCase())
    .optional(),
});

export async function registerSystemRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  client: HomeAssistantClient,
): Promise<void> {
  app.get('/api/v1/config', async () => {
    const haConfig = await client.getConfig();
    return {
      home_assistant: {
        location_name: haConfig.location_name,
        time_zone: haConfig.time_zone,
        version: haConfig.version,
        state: haConfig.state,
        unit_system: haConfig.unit_system,
      },
      gateway: {
        read_only: config.readOnly,
        allowed_domains: [...config.allowedDomains].sort(),
        entity_allowlist_enabled: config.allowedEntities.size > 0,
      },
    };
  });

  app.get('/api/v1/services', async (request, reply) => {
    const parsedQuery = serviceQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send(invalidRequest(parsedQuery.error.issues));
    }
    const requestedDomain = parsedQuery.data.domain;
    if (requestedDomain && !config.allowedDomains.has(requestedDomain)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Domain is not allowed.' });
    }
    const services = await client.getServices();

    return {
      domains: services
        .filter(({ domain }) => config.allowedDomains.has(domain.toLowerCase()))
        .filter(({ domain }) => !requestedDomain || domain.toLowerCase() === requestedDomain)
        .map(({ domain, services: domainServices }) => ({ domain, services: domainServices })),
    };
  });

  app.get('/api/v1/diagnostics', async () => {
    const startedAt = Date.now();
    const haConfig = await client.getConfig();
    return {
      status: 'ok',
      home_assistant: {
        reachable: true,
        version: haConfig.version,
        state: haConfig.state,
        response_ms: Date.now() - startedAt,
      },
      gateway: {
        read_only: config.readOnly,
        rate_limit_enabled: config.rateLimitMax > 0,
      },
    };
  });

  app.get('/api/v1/areas', async () => {
    const [areas, devices, entities] = await Promise.all([
      client.getAreas(),
      client.getDevices(),
      client.getEntityRegistry(),
    ]);
    const allowedDeviceIds = new Set(
      entities
        .filter((entity) => isEntityAllowed(config, entity.entity_id))
        .flatMap((entity) => (entity.device_id ? [entity.device_id] : [])),
    );
    const allowedAreaIds = new Set(
      entities
        .filter((entity) => isEntityAllowed(config, entity.entity_id))
        .flatMap((entity) => (entity.area_id ? [entity.area_id] : [])),
    );
    for (const device of devices) {
      if (allowedDeviceIds.has(device.id) && device.area_id) {
        allowedAreaIds.add(device.area_id);
      }
    }
    return {
      areas: areas
        .filter((area) => allowedAreaIds.has(area.area_id))
        .map((area) => ({ area_id: area.area_id, name: area.name, aliases: area.aliases ?? [] })),
    };
  });

  app.get('/api/v1/devices', async () => {
    const [devices, entities] = await Promise.all([
      client.getDevices(),
      client.getEntityRegistry(),
    ]);
    const allowedDeviceIds = new Set(
      entities
        .filter((entity) => isEntityAllowed(config, entity.entity_id))
        .flatMap((entity) => (entity.device_id ? [entity.device_id] : [])),
    );
    return {
      devices: devices
        .filter((device) => allowedDeviceIds.has(device.id))
        .map((device) => ({
          id: device.id,
          area_id: device.area_id ?? null,
          name: device.name_by_user ?? device.name ?? null,
          manufacturer: device.manufacturer ?? null,
          model: device.model ?? null,
        })),
    };
  });
}
