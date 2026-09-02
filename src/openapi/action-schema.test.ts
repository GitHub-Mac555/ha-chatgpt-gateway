import { describe, expect, it } from 'vitest';
import { buildOpenApiSchema } from './action-schema.js';

describe('diagnostic OpenAPI feature flags', () => {
  it('does not advertise diagnostic logs by default', () => {
    const schema = buildOpenApiSchema('https://gateway.example.com');
    expect(schema.paths).not.toHaveProperty('/api/v1/logbook');
  });

});
