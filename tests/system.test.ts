import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { WebSocketLike } from '../src/home-assistant/client.js';
import { makeConfig } from './helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

class FakeHomeAssistantWebSocket implements WebSocketLike {
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  addEventListener(type: 'message' | 'error', listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    if (type === 'message') {
      queueMicrotask(() => this.emit({ type: 'auth_required' }));
    }
  }

  send(data: string): void {
    const message = JSON.parse(data) as { type?: string; id?: number };
    if (message.type === 'auth') {
      this.emit({ type: 'auth_ok' });
      return;
    }
    const results: Record<string, unknown> = {
      'config/area_registry/list': [
        { area_id: 'living_room', name: 'Living room' },
        { area_id: 'private_area', name: 'Private area' },
      ],
      'config/device_registry/list': [
        { id: 'device-1', area_id: 'living_room', name: 'Lamp bridge' },
        { id: 'device-2', area_id: 'private_area', name: 'Door lock bridge' },
      ],
      'config/entity_registry/list': [
        { entity_id: 'light.living_room', device_id: 'device-1' },
        { entity_id: 'lock.front_door', device_id: 'device-2' },
      ],
    };
    this.emit({
      type: 'result',
      id: message.id,
      success: true,
      result: results[message.type ?? ''],
    });
  }

  close(): void {}

  private emit(payload: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }
}

describe('system routes and Home Assistant failures', () => {
  it('returns safe config, diagnostics, and dynamic allowed service discovery', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/config')) {
        return jsonResponse({
          location_name: 'Home',
          time_zone: 'Europe/Rome',
          version: '2026.8.0',
          state: 'RUNNING',
        });
      }
      return jsonResponse([
        {
          domain: 'light',
          services: {
            turn_on: {
              name: 'Turn on',
              description: 'Turn on one or more lights.',
              fields: {
                brightness_pct: {
                  description: 'Brightness in percent.',
                  required: false,
                  example: 50,
                  selector: { number: { min: 1, max: 100 } },
                },
              },
            },
          },
        },
        { domain: 'lock', services: { unlock: { name: 'Unlock' } } },
      ]);
    });
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };

    const configResponse = await app.inject({ method: 'GET', url: '/api/v1/config', headers });
    expect(configResponse.statusCode).toBe(200);
    expect(JSON.stringify(configResponse.json())).not.toContain('ha-test-token');

    const diagnostics = await app.inject({ method: 'GET', url: '/api/v1/diagnostics', headers });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json().home_assistant.reachable).toBe(true);

    const services = await app.inject({ method: 'GET', url: '/api/v1/services', headers });
    expect(services.json().domains).toHaveLength(1);
    expect(services.json().domains[0].domain).toBe('light');

    const disallowed = await app.inject({
      method: 'GET',
      url: '/api/v1/services?domain=lock',
      headers,
    });
    expect(disallowed.statusCode).toBe(403);
    await app.close();
  });

  it('returns a compact live contract for one allowed service', async () => {
    const servicePayload = [
      {
        domain: 'climate',
        services: {
          set_fan_mode: {
            name: 'Set fan mode',
            description: 'Set the fan mode.',
            fields: {
              fan_mode: {
                description: 'Fan mode to set.',
                required: true,
                example: 'medium',
                selector: { select: { options: ['low', 'medium', 'high'] } },
              },
            },
          },
        },
      },
    ];
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse(servicePayload));
    const config = makeConfig({ allowedDomains: new Set(['climate']) });
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/services/climate/set_fan_mode',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: {
        domain: 'climate',
        service: 'set_fan_mode',
        name: 'Set fan mode',
        description: 'Set the fan mode.',
        target: {},
        fields: [
          {
            name: 'fan_mode',
            description: 'Fan mode to set.',
            required: true,
            example: 'medium',
            selector: { select: { options: ['low', 'medium', 'high'] } },
          },
        ],
      },
    });

    const notFound = await app.inject({
      method: 'GET',
      url: '/api/v1/services/climate/not_real',
      headers,
    });
    expect(notFound.statusCode).toBe(404);
    await app.close();
  });

  it.each([
    [401, 502, 'home_assistant_error'],
    [404, 404, 'not_found'],
    [500, 502, 'home_assistant_error'],
  ])('maps Home Assistant HTTP %i safely', async (haStatus, expectedStatus, error) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ detail: 'private upstream data' }, haStatus));
    const config = makeConfig();
    const app = await buildApp({ config, fetchImpl: fetchMock, logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/entities/light.living_room',
      headers: { authorization: `Bearer ${config.gatewayApiKey}` },
    });
    expect(response.statusCode).toBe(expectedStatus);
    expect(response.json().error).toBe(error);
    expect(response.body).not.toContain('private upstream data');
    await app.close();
  });

  it('maps unreachable and timed out Home Assistant to 503', async () => {
    const unavailable = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('network unreachable'));
    const config = makeConfig({ homeAssistantTimeoutMs: 20 });
    const app = await buildApp({ config, fetchImpl: unavailable, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/entities/light.living_room',
      headers,
    });
    expect(response.statusCode).toBe(503);
    await app.close();

    const hangingFetch = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    const timeoutApp = await buildApp({ config, fetchImpl: hangingFetch, logger: false });
    const timeout = await timeoutApp.inject({
      method: 'GET',
      url: '/api/v1/entities/light.living_room',
      headers,
    });
    expect(timeout.statusCode).toBe(503);
    expect(timeout.json().error).toBe('home_assistant_unavailable');
    await timeoutApp.close();
  });

  it('enforces the optional in-memory rate limit after authentication', async () => {
    const config = makeConfig({ rateLimitMax: 1, rateLimitWindowMs: 60_000 });
    const app = await buildApp({ config, logger: false });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };
    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/entities/lock.front_door',
      headers,
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/entities/lock.front_door',
      headers,
    });
    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(429);
    await app.close();
  });

  it('returns only area and device registry records related to allowed entities', async () => {
    const config = makeConfig();
    const app = await buildApp({
      config,
      logger: false,
      webSocketFactory: () => new FakeHomeAssistantWebSocket(),
    });
    const headers = { authorization: `Bearer ${config.gatewayApiKey}` };
    const areas = await app.inject({ method: 'GET', url: '/api/v1/areas', headers });
    const devices = await app.inject({ method: 'GET', url: '/api/v1/devices', headers });
    expect(areas.json().areas).toEqual([
      { area_id: 'living_room', name: 'Living room', aliases: [] },
    ]);
    expect(devices.json().devices).toEqual([
      {
        id: 'device-1',
        area_id: 'living_room',
        name: 'Lamp bridge',
        manufacturer: null,
        model: null,
      },
    ]);
    await app.close();
  });
});
