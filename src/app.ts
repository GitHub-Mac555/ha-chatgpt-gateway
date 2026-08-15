import Fastify, { type FastifyInstance } from 'fastify';
import type { GatewayConfig } from './config/env.js';
import { HomeAssistantClient, HomeAssistantError } from './home-assistant/client.js';
import { buildOpenApiSchema } from './openapi/action-schema.js';
import { registerEntityRoutes } from './routes/entities.js';
import { registerHealthRoute } from './routes/health.js';
import { registerServiceRoutes } from './routes/services.js';
import { registerSystemRoutes } from './routes/system.js';
import { createAuthenticationHook } from './security/authentication.js';

export interface BuildAppOptions {
  config: GatewayConfig;
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.config.logLevel },
    bodyLimit: 1024 * 1024,
  });

  const client = new HomeAssistantClient(options.config, options.fetchImpl);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HomeAssistantError) {
      const statusCode = error.statusCode === 404 ? 404 : 502;
      return reply.code(statusCode).send({
        error: 'home_assistant_error',
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: 'internal_error',
      message: 'An unexpected gateway error occurred.',
    });
  });

  await registerHealthRoute(app, options.config);

  app.get('/openapi.json', async () => buildOpenApiSchema());

  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', createAuthenticationHook(options.config));
    await registerEntityRoutes(protectedApp, options.config, client);
    await registerServiceRoutes(protectedApp, options.config, client);
    await registerSystemRoutes(protectedApp, options.config, client);
  });

  return app;
}
