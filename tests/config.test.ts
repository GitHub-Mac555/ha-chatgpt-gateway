import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const commonEnv = {
  HOME_ASSISTANT_URL: 'http://homeassistant.local:8123',
  HOME_ASSISTANT_TOKEN: 'ha-test-token',
  ALLOWED_DOMAINS: 'light,switch',
  ALLOWED_ENTITIES: 'light.safe_test',
};

function strongKey(): string {
  return randomBytes(32).toString('hex');
}

describe('configuration', () => {
  it('supports separate read and write API keys without a legacy full-access key', () => {
    const readKey = strongKey();
    const writeKey = strongKey();
    const config = loadConfig({
      ...commonEnv,
      GATEWAY_READ_API_KEY: readKey,
      GATEWAY_WRITE_API_KEY: writeKey,
    });
    expect(config.gatewayCredentials).toEqual([
      { id: 'read', key: readKey, scopes: new Set(['read']) },
      { id: 'write', key: writeKey, scopes: new Set(['read', 'write']) },
    ]);
    expect(config.serviceRateLimitMax).toBe(20);
  });

  it.each(['GATEWAY_API_KEY', 'GATEWAY_READ_API_KEY', 'GATEWAY_WRITE_API_KEY'] as const)(
    'rejects a short or non-hex %s',
    (keyName) => {
      expect(() => loadConfig({ ...commonEnv, [keyName]: 'too-short' })).toThrow(/64 hexadecimal/);
      expect(() => loadConfig({ ...commonEnv, [keyName]: 'z'.repeat(64) })).toThrow(
        /64 hexadecimal/,
      );
    },
  );

  it('accepts a randomly generated legacy key', () => {
    const key = strongKey();
    expect(loadConfig({ ...commonEnv, GATEWAY_API_KEY: key }).gatewayApiKey).toBe(key);
  });

  it('defaults to trusting no reverse proxies', () => {
    const config = loadConfig({ ...commonEnv, GATEWAY_API_KEY: strongKey() });
    expect(config.trustedProxies).toEqual([]);
  });

  it('accepts explicit IPv4, IPv6, and CIDR trusted proxies', () => {
    const config = loadConfig({
      ...commonEnv,
      GATEWAY_API_KEY: strongKey(),
      TRUSTED_PROXIES: '127.0.0.1,2001:db8::1,192.168.10.0/24',
    });
    expect(config.trustedProxies).toEqual(['127.0.0.1', '2001:db8::1', '192.168.10.0/24']);
  });

  it.each(['not-an-ip', '999.999.999.999', '192.168.1.1/999'])(
    'rejects an invalid trusted proxy value: %s',
    (trustedProxy) => {
      expect(() =>
        loadConfig({
          ...commonEnv,
          GATEWAY_API_KEY: strongKey(),
          TRUSTED_PROXIES: trustedProxy,
        }),
      ).toThrow(/TRUSTED_PROXIES/);
    },
  );

  it('rejects duplicate configured gateway keys', () => {
    const key = strongKey();
    expect(() =>
      loadConfig({
        ...commonEnv,
        GATEWAY_READ_API_KEY: key,
        GATEWAY_WRITE_API_KEY: key,
      }),
    ).toThrow(/distinct/);
  });

  it('allows empty entities only in read-only discovery mode', () => {
    expect(() =>
      loadConfig({
        ...commonEnv,
        GATEWAY_API_KEY: strongKey(),
        ALLOWED_ENTITIES: '',
        READ_ONLY: 'true',
      }),
    ).not.toThrow();
  });

  it('rejects write mode without an explicit entity allowlist', () => {
    expect(() =>
      loadConfig({
        ...commonEnv,
        GATEWAY_API_KEY: strongKey(),
        ALLOWED_ENTITIES: '',
        READ_ONLY: 'false',
      }),
    ).toThrow(/ALLOWED_ENTITIES/);
  });

  it('requires at least one gateway API key', () => {
    expect(() => loadConfig(commonEnv)).toThrow(/GATEWAY_API_KEY/);
  });
});
