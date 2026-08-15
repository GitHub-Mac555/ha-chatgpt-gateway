import type { GatewayConfig } from '../config/env.js';

export function getEntityDomain(entityId: string): string | undefined {
  const separatorIndex = entityId.indexOf('.');
  return separatorIndex > 0 ? entityId.slice(0, separatorIndex).toLowerCase() : undefined;
}

export function isDomainAllowed(config: GatewayConfig, domain: string): boolean {
  return config.allowedDomains.has(domain.toLowerCase());
}

export function isEntityAllowed(config: GatewayConfig, entityId: string): boolean {
  const normalizedEntityId = entityId.toLowerCase();
  const domain = getEntityDomain(normalizedEntityId);

  if (!domain || !isDomainAllowed(config, domain)) {
    return false;
  }

  return config.allowedEntities.size === 0 || config.allowedEntities.has(normalizedEntityId);
}
