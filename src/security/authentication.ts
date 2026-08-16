import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig, GatewayScope } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    gatewayAuth?: {
      credentialIds: readonly string[];
      scopes: ReadonlySet<GatewayScope>;
    };
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function createAuthenticationHook(config: GatewayConfig) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'A valid Bearer API key is required.',
      });
    }

    const scopes = new Set<GatewayScope>();
    const credentialIds: string[] = [];
    // Compare every configured credential before deciding. This avoids turning
    // the configured key set into an early-return timing oracle.
    for (const credential of config.gatewayCredentials) {
      if (safeEqual(token, credential.key)) {
        credentialIds.push(credential.id);
        for (const scope of credential.scopes) scopes.add(scope);
      }
    }

    if (scopes.size === 0) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'A valid Bearer API key is required.',
      });
    }

    request.gatewayAuth = { credentialIds, scopes };
  };
}

export function hasGatewayScope(request: FastifyRequest, scope: GatewayScope): boolean {
  return request.gatewayAuth?.scopes.has(scope) ?? false;
}
