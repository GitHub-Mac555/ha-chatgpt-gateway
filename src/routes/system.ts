import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';

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

  app.get('/api/v1/services', async (request) => {
    const query = request.query as { domain?: string };
    const requestedDomain = query.domain?.toLowerCase();
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
      },
    };
  });
}
