import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config/env.js';

export async function registerHealthRoute(app: FastifyInstance, config: GatewayConfig): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    readOnly: config.readOnly,
  }));
}
