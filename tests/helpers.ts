import type { GatewayConfig } from '../src/config/env.js';

export function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 8787,
    homeAssistantUrl: 'http://homeassistant.local:8123',
    homeAssistantToken: 'ha-test-token',
    gatewayApiKey: 'gateway-test-key-1234567890',
    allowedDomains: new Set(['light', 'switch']),
    allowedEntities: new Set(),
    readOnly: false,
    logLevel: 'silent',
    ...overrides,
  };
}

export const sampleStates = [
  { entity_id: 'light.living_room', state: 'on', attributes: { friendly_name: 'Living room' }, last_changed: '2026-08-15T10:00:00+00:00', last_updated: '2026-08-15T10:00:00+00:00' },
  { entity_id: 'switch.coffee_machine', state: 'off', attributes: { friendly_name: 'Coffee machine' }, last_changed: '2026-08-15T10:00:00+00:00', last_updated: '2026-08-15T10:00:00+00:00' },
  { entity_id: 'lock.front_door', state: 'locked', attributes: { friendly_name: 'Front door' }, last_changed: '2026-08-15T10:00:00+00:00', last_updated: '2026-08-15T10:00:00+00:00' },
];
