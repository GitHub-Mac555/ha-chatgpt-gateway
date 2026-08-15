import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeConfig, sampleStates } from './helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('entity routes', () => {
  it('requires the gateway API key', async () => {
    const app = await buildApp({ config: makeConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/entities' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('filters out disallowed domains', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(sampleStates));
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/entities', headers: { authorization: `Bearer ${config.gatewayApiKey}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().entities.map((item: { entity_id: string }) => item.entity_id)).toEqual(['light.living_room', 'switch.coffee_machine']);
    await app.close();
  });

  it('honors an explicit entity allowlist', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(sampleStates));
    const config = makeConfig({ allowedEntities: new Set(['light.living_room']) });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/entities', headers: { authorization: `Bearer ${config.gatewayApiKey}` } });
    expect(response.json().entities).toHaveLength(1);
    expect(response.json().entities[0].entity_id).toBe('light.living_room');
    await app.close();
  });

  it('rejects access to a disallowed entity before contacting Home Assistant', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/entities/lock.front_door', headers: { authorization: `Bearer ${config.gatewayApiKey}` } });
    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
