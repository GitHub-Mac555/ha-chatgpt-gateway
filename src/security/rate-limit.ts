import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayConfig } from '../config/env.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** A deliberately small, process-local limiter. Set RATE_LIMIT_MAX=0 to disable it. */
export function createRateLimitHook(config: GatewayConfig) {
  const entries = new Map<string, RateLimitEntry>();

  return async function rateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    if (config.rateLimitMax === 0) {
      return;
    }

    const now = Date.now();
    const key = request.ip;
    const entry = entries.get(key);
    const current =
      !entry || entry.resetAt <= now
        ? { count: 0, resetAt: now + config.rateLimitWindowMs }
        : entry;
    current.count += 1;
    entries.set(key, current);

    reply.header('RateLimit-Limit', config.rateLimitMax);
    reply.header('RateLimit-Remaining', Math.max(0, config.rateLimitMax - current.count));
    reply.header('RateLimit-Reset', Math.ceil(current.resetAt / 1000));

    if (current.count > config.rateLimitMax) {
      reply.header('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return reply.code(429).send({
        error: 'rate_limited',
        message: 'Too many requests. Try again shortly.',
      });
    }
  };
}

/**
 * A stricter write-only limiter. It is keyed by authenticated credential ID
 * and client IP so a read-only integration does not consume write capacity.
 */
export function createServiceRateLimitHook(config: GatewayConfig) {
  const entries = new Map<string, RateLimitEntry>();

  return async function rateLimitServiceCall(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    if (config.serviceRateLimitMax === 0) {
      return;
    }

    const now = Date.now();
    const credentialId = request.gatewayAuth?.credentialIds.join(',') || 'unknown';
    const key = `${credentialId}:${request.ip}`;
    const entry = entries.get(key);
    const current =
      !entry || entry.resetAt <= now
        ? { count: 0, resetAt: now + config.serviceRateLimitWindowMs }
        : entry;
    current.count += 1;
    entries.set(key, current);

    reply.header('ServiceRateLimit-Limit', config.serviceRateLimitMax);
    reply.header(
      'ServiceRateLimit-Remaining',
      Math.max(0, config.serviceRateLimitMax - current.count),
    );
    reply.header('ServiceRateLimit-Reset', Math.ceil(current.resetAt / 1000));

    if (current.count > config.serviceRateLimitMax) {
      reply.header('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return reply.code(429).send({
        error: 'rate_limited',
        message: 'Too many service calls. Try again shortly.',
      });
    }
  };
}
