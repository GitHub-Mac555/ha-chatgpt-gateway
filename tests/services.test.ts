import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeConfig } from './helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function targetStateResponse(url: string): Response {
  const entityId = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
  return jsonResponse({
    entity_id: entityId,
    state: 'on',
    attributes: {},
    last_changed: '2026-08-16T00:00:00Z',
    last_updated: '2026-08-16T00:00:00Z',
  });
}

function mockServiceResponses(
  responses: Array<{ body: unknown; status?: number }> = [{ body: [] }],
) {
  let serviceResponseIndex = 0;
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/api/states/')) return targetStateResponse(url);
    const response = responses[serviceResponseIndex++] ?? { body: [] };
    return jsonResponse(response.body, response.status);
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

  it('blocks service batches in read-only mode', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig({ readOnly: true });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/batch',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        calls: [{ domain: 'light', service: 'turn_on', entity_id: ['light.living_room'] }],
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('read_only');
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

  it('rejects an allowed group when any resolved member is not allowed', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/states/light.safe_group')) {
        return jsonResponse({
          entity_id: 'light.safe_group',
          state: 'on',
          attributes: { entity_id: ['light.allowed', 'light.blocked'] },
          last_changed: '2026-08-16T00:00:00Z',
          last_updated: '2026-08-16T00:00:00Z',
        });
      }
      return jsonResponse([]);
    });
    const config = makeConfig({
      allowedEntities: new Set(['light.safe_group', 'light.allowed']),
    });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: ['light.safe_group'] },
    });
    expect(response.statusCode).toBe(403);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      'http://homeassistant.local:8123/api/services/light/turn_on',
    );
    await app.close();
  });

  it('expands an allowed group to its allowed concrete members before the service call', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/states/light.safe_group')) {
        return jsonResponse({
          entity_id: 'light.safe_group',
          state: 'on',
          attributes: { entity_id: ['light.allowed'] },
          last_changed: '2026-08-16T00:00:00Z',
          last_updated: '2026-08-16T00:00:00Z',
        });
      }
      if (url.endsWith('/api/states/light.allowed')) return targetStateResponse(url);
      return jsonResponse([]);
    });
    const config = makeConfig({
      allowedEntities: new Set(['light.safe_group', 'light.allowed']),
    });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: ['light.safe_group'] },
    });
    expect(response.statusCode).toBe(200);
    const serviceCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/services/'),
    );
    expect(JSON.parse(String(serviceCall?.[1]?.body))).toEqual({ entity_id: ['light.allowed'] });
    await app.close();
  });

  it('denies service calls made with a read-only API key', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig({
      gatewayApiKey: 'read-only-test-key-1234567890',
      gatewayCredentials: [
        { id: 'read', key: 'read-only-test-key-1234567890', scopes: new Set(['read']) },
      ],
    });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: { domain: 'light', service: 'turn_on', entity_id: ['light.living_room'] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('write scope');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('enforces a separate per-credential limit for service calls', async () => {
    const fetchMock = mockServiceResponses();
    const config = makeConfig({ serviceRateLimitMax: 1, serviceRateLimitWindowMs: 60_000 });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };
    const payload = { domain: 'light', service: 'turn_on', entity_id: ['light.living_room'] };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers['serviceratelimit-limit']).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('uses the real client address for service limits behind a trusted proxy', async () => {
    const fetchMock = mockServiceResponses();
    const config = makeConfig({
      serviceRateLimitMax: 1,
      serviceRateLimitWindowMs: 60_000,
      trustedProxies: ['127.0.0.1'],
    });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const payload = { domain: 'light', service: 'turn_on', entity_id: ['light.living_room'] };
    const request = (clientIp: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/services/call',
        remoteAddress: '127.0.0.1',
        headers: {
          authorization: `Bearer ${config.gatewayApiKey}`,
          'x-forwarded-for': clientIp,
        },
        payload,
      });

    expect((await request('203.0.113.10')).statusCode).toBe(200);
    expect((await request('203.0.113.10')).statusCode).toBe(429);
    expect((await request('203.0.113.11')).statusCode).toBe(200);
    await app.close();
  });

  it('forwards an allowed service call to Home Assistant', async () => {
    const fetchMock = mockServiceResponses();
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://homeassistant.local:8123/api/services/light/turn_on');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      brightness_pct: 50,
      entity_id: 'light.living_room',
    });
    await app.close();
  });

  it('accepts Action-friendly JSON service data for dynamic Home Assistant fields', async () => {
    const fetchMock = mockServiceResponses();
    const config = makeConfig({ allowedDomains: new Set(['climate']) });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        domain: 'climate',
        service: 'set_temperature',
        entity_id: ['climate.bedroom_air_conditioner'],
        data_json: '{"temperature":27,"hvac_mode":"cool","fan_mode":"medium"}',
      },
    });
    expect(response.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://homeassistant.local:8123/api/services/climate/set_temperature');
    expect(JSON.parse(String(init?.body))).toEqual({
      entity_id: ['climate.bedroom_air_conditioner'],
      temperature: 27,
      hvac_mode: 'cool',
      fan_mode: 'medium',
    });
    await app.close();
  });

  it('rejects malformed or unsafe JSON service data before contacting Home Assistant', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers,
      payload: {
        domain: 'light',
        service: 'turn_on',
        entity_id: ['light.living_room'],
        data_json: '{not-json}',
      },
    });
    const unsafe = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers,
      payload: {
        domain: 'light',
        service: 'turn_on',
        entity_id: ['light.living_room'],
        data_json: '{"area_id":"living_room"}',
      },
    });
    const templated = await app.inject({
      method: 'POST',
      url: '/api/v1/services/call',
      headers,
      payload: {
        domain: 'light',
        service: 'turn_on',
        entity_id: ['light.living_room'],
        data_json: '{"brightness_pct":"{{ states(\\\'lock.front_door\\\') }}"}',
      },
    });
    expect(malformed.statusCode).toBe(400);
    expect(unsafe.statusCode).toBe(400);
    expect(templated.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('supports multiple allowed entities in one service call', async () => {
    const fetchMock = mockServiceResponses();
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
    const [, init] = fetchMock.mock.calls[2]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      brightness_pct: 25,
      entity_id: ['light.living_room', 'light.kitchen'],
    });
    await app.close();
  });

  it('accepts target.entity_id and rejects unsafe target types', async () => {
    const fetchMock = mockServiceResponses();
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

  it('validates an entire batch before it performs any Home Assistant write', async () => {
    const fetchMock = mockServiceResponses();
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/batch',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        calls: [
          {
            domain: 'light',
            service: 'turn_on',
            entity_id: ['light.living_room'],
            data_json: '{"brightness_pct":50}',
          },
          {
            domain: 'lock',
            service: 'unlock',
            entity_id: ['lock.front_door'],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(403);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      'http://homeassistant.local:8123/api/services/light/turn_on',
    );
    await app.close();
  });

  it('runs an allowed batch in order', async () => {
    const fetchMock = mockServiceResponses([
      { body: [{ state: 'cool' }] },
      { body: [{ temperature: 27 }] },
      { body: [{ fan_mode: 'medium' }] },
    ]);
    const config = makeConfig({ allowedDomains: new Set(['climate']) });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/batch',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        calls: [
          {
            domain: 'climate',
            service: 'set_hvac_mode',
            entity_id: ['climate.bedroom_air_conditioner'],
            data_json: '{"hvac_mode":"cool"}',
          },
          {
            domain: 'climate',
            service: 'set_temperature',
            entity_id: ['climate.bedroom_air_conditioner'],
            data_json: '{"temperature":27}',
          },
          {
            domain: 'climate',
            service: 'set_fan_mode',
            entity_id: ['climate.bedroom_air_conditioner'],
            data_json: '{"fan_mode":"medium"}',
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      results: [[{ state: 'cool' }], [{ temperature: 27 }], [{ fan_mode: 'medium' }]],
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://homeassistant.local:8123/api/states/climate.bedroom_air_conditioner',
      'http://homeassistant.local:8123/api/states/climate.bedroom_air_conditioner',
      'http://homeassistant.local:8123/api/states/climate.bedroom_air_conditioner',
      'http://homeassistant.local:8123/api/services/climate/set_hvac_mode',
      'http://homeassistant.local:8123/api/services/climate/set_temperature',
      'http://homeassistant.local:8123/api/services/climate/set_fan_mode',
    ]);
    await app.close();
  });

  it('stops a batch when Home Assistant rejects one of its calls', async () => {
    const fetchMock = mockServiceResponses([
      { body: [] },
      { body: { detail: 'upstream failure' }, status: 500 },
    ]);
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/services/batch',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
      payload: {
        calls: [
          { domain: 'light', service: 'turn_on', entity_id: ['light.living_room'] },
          { domain: 'light', service: 'turn_off', entity_id: ['light.living_room'] },
          { domain: 'light', service: 'toggle', entity_id: ['light.living_room'] },
        ],
      },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('home_assistant_error');
    expect(fetchMock).toHaveBeenCalledTimes(5);
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
