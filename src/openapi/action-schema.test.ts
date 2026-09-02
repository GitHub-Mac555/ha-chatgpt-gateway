import { describe, expect, it } from 'vitest';
import { buildOpenApiSchema } from './action-schema.js';

describe('diagnostic OpenAPI feature flags', () => {
  it('does not advertise diagnostic logs by default', () => {
    const schema = buildOpenApiSchema('https://gateway.example.com');
    expect(schema.paths).not.toHaveProperty('/api/v1/logs/errors');
    expect(schema.paths).not.toHaveProperty('/api/v1/logbook');
  });

  it('advertises only explicitly enabled diagnostic routes', () => {
    const errorSchema = buildOpenApiSchema('https://gateway.example.com', {
      errorLogsEnabled: true,
    });
    expect(errorSchema.paths).toHaveProperty('/api/v1/logs/errors');
    expect(errorSchema.paths).not.toHaveProperty('/api/v1/logbook');

    const logbookSchema = buildOpenApiSchema('https://gateway.example.com', {
      logbookEnabled: true,
    });
    expect(logbookSchema.paths).not.toHaveProperty('/api/v1/logs/errors');
    expect(logbookSchema.paths).toHaveProperty('/api/v1/logbook');
  });

  it('advertises both routes when both opt-ins are enabled', () => {
    const schema = buildOpenApiSchema('https://gateway.example.com', {
      errorLogsEnabled: true,
      logbookEnabled: true,
    });
    expect(schema.paths).toHaveProperty('/api/v1/logs/errors');
    expect(schema.paths).toHaveProperty('/api/v1/logbook');
  });
  it('documents state values as opt-in for logbook', () => {
    const schema = buildOpenApiSchema('https://gateway.example.com', {
      logbookEnabled: true,
    });
    const logbook = schema.paths['/api/v1/logbook'];
    expect(logbook).toBeDefined();
    const parameters = logbook && 'get' in logbook ? logbook.get.parameters : [];
    const includeState = parameters?.find((parameter) => parameter.name === 'include_state');
    expect(includeState?.schema).toMatchObject({ type: 'boolean', default: false });
  });

});
