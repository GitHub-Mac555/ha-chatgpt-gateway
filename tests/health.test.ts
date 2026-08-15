import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildApp } from '../src/app.js';
import { makeConfig } from './helpers.js';

describe('health and OpenAPI', () => {
  it('exposes public health without authentication', async () => {
    const app = await buildApp({ config: makeConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.2.0', readOnly: false });
    await app.close();
  });

  it('publishes a valid OpenAPI 3.1 schema without credentials', async () => {
    const app = await buildApp({ config: makeConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBe('3.1.0');
    expect(response.json().paths['/api/v1/services/call']).toBeDefined();
    expect(response.json().paths['/api/v1/areas']).toBeDefined();
    expect(JSON.stringify(response.json())).not.toContain('HOME_ASSISTANT_TOKEN');
    expect(JSON.stringify(response.json())).not.toContain('ha-test-token');
    await expect(SwaggerParser.validate(response.json())).resolves.toBeDefined();
    await app.close();
  });

  it('advertises the configured public URL for GPT Action imports', async () => {
    const app = await buildApp({
      config: makeConfig({ publicBaseUrl: 'https://gateway.example.com' }),
      logger: false,
    });
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.json().servers).toEqual([{ url: 'https://gateway.example.com' }]);
    await app.close();
  });
});
