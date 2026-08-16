import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const commonEnv = {
  HOME_ASSISTANT_URL: 'http://homeassistant.local:8123',
  HOME_ASSISTANT_TOKEN: 'ha-test-token',
  ALLOWED_DOMAINS: 'light,switch',
};

describe('configuration', () => {
  it('supports separate read and write API keys without a legacy full-access key', () => {
    const config = loadConfig({
      ...commonEnv,
      GATEWAY_READ_API_KEY: 'read-key-1234567890',
      GATEWAY_WRITE_API_KEY: 'write-key-1234567890',
    });
    expect(config.gatewayCredentials).toEqual([
      { id: 'read', key: 'read-key-1234567890', scopes: new Set(['read']) },
      { id: 'write', key: 'write-key-1234567890', scopes: new Set(['read', 'write']) },
    ]);
    expect(config.serviceRateLimitMax).toBe(20);
  });

  it('requires at least one gateway API key', () => {
    expect(() => loadConfig(commonEnv)).toThrow(/GATEWAY_API_KEY/);
  });
});
