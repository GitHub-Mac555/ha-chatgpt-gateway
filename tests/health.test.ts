import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { makeConfig } from './helpers.js';

describe('health and OpenAPI', () => {
  it('exposes public health without authentication', async () => {
    const app = await buildApp({ config: makeConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.1.0', readOnly: false });
    await app.close();
  });

  it('publishes an OpenAPI 3.1 schema', async () => {
    const app = await buildApp({ config: makeConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBe('3.1.0');
    expect(response.json().paths['/api/v1/services/call']).toBeDefined();
    await app.close();
  });
});
