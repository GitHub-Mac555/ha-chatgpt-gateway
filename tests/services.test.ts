import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeConfig } from './helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('service route', () => {
  it('blocks all writes in read-only mode', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig({ readOnly: true });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: 'light.living_room' },
    });
    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks a disallowed domain', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'lock', service: 'unlock', entity_id: 'lock.front_door' },
    });
    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards an allowed service call to Home Assistant', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        domain: 'light',
        service: 'turn_on',
        entity_id: 'light.living_room',
        data: { brightness_pct: 50 },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://homeassistant.local:8123/api/services/light/turn_on');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      brightness_pct: 50,
      entity_id: 'light.living_room',
    });
    await app.close();
  });

  it('supports multiple allowed entities in one service call', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        domain: 'light',
        service: 'turn_on',
        entity_id: ['light.living_room', 'light.kitchen'],
        data: { brightness_pct: 25 },
      },
    });
    expect(response.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      brightness_pct: 25,
      entity_id: ['light.living_room', 'light.kitchen'],
    });
    await app.close();
  });

  it('accepts target.entity_id and rejects unsafe target types', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', target: { entity_id: 'light.living_room' } },
    });
    expect(allowed.statusCode).toBe(200);
    const unsafe = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', target: { area_id: ['living-room'] } },
    });
    expect(unsafe.statusCode).toBe(403);
    await app.close();
  });

  it('rejects malformed entities and entity/domain mismatches before contacting Home Assistant', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: 'not-an-entity' },
    });
    expect(malformed.statusCode).toBe(400);
    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: 'switch.coffee_machine' },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
