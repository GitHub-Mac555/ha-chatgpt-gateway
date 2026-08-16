import type { GatewayConfig } from '../config/env.js';

/**
 * Target-less actions that can affect Home Assistant globally. They are never
 * exposed by normal service calls: each one requires both the feature flag and
 * an exact entry in ADMIN_ALLOWED_ACTIONS.
 */
export const supportedAdminActions = new Set([
  'automation.reload',
  'homeassistant.check_config',
  'homeassistant.reload_all',
  'homeassistant.reload_core_config',
  'homeassistant.reload_custom_templates',
  'homeassistant.restart',
  'scene.reload',
  'script.reload',
]);

export function getAdminActionId(domain: string, service: string): string {
  return `${domain.toLowerCase()}.${service.toLowerCase()}`;
}

export function isAdminActionAllowed(
  config: GatewayConfig,
  domain: string,
  service: string,
): boolean {
  return (
    config.adminActionsEnabled && config.adminAllowedActions.has(getAdminActionId(domain, service))
  );
}
