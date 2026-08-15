import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig } from '../config/env.js';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthenticationHook(config: GatewayConfig) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token || !safeEqual(token, config.gatewayApiKey)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'A valid Bearer API key is required.',
      });
    }
  };
}
