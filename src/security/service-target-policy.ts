import type { HomeAssistantServiceDefinition } from '../home-assistant/types.js';

type EntityFieldPolicy = {
  allowedDomains: Set<string>;
  multiple: boolean;
};

export type ServiceTargetPolicy = {
  /** Domains accepted by the service's explicit entity target. */
  targetDomains: Set<string>;
  /** Entity-valued service-data fields that must also pass gateway policy. */
  dataEntityFields: Map<string, EntityFieldPolicy>;
};

function validDomain(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[a-z0-9_]+$/i.test(value)) return undefined;
  return value.toLowerCase();
}

function collectDomains(value: unknown, result: Set<string>): void {
  if (typeof value === 'string') {
    const domain = validDomain(value);
    if (domain) result.add(domain);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDomains(item, result);
  }
}

function selectorEntityPolicy(value: unknown): EntityFieldPolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entity = (value as Record<string, unknown>).entity;
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return undefined;

  const entitySelector = entity as Record<string, unknown>;
  const allowedDomains = new Set<string>();
  collectDomains(entitySelector.domain, allowedDomains);
  const filters = entitySelector.filter;
  if (Array.isArray(filters)) {
    for (const filter of filters) {
      if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
        collectDomains((filter as Record<string, unknown>).domain, allowedDomains);
      }
    }
  }

  return { allowedDomains, multiple: entitySelector.multiple === true };
}

/**
 * Derive only the entity-target rules that Home Assistant publishes for one
 * service. Services with no entity target (and no legacy entity_id selector)
 * remain unavailable: the gateway never permits global calls.
 */
export function buildServiceTargetPolicy(
  serviceDomain: string,
  definition: HomeAssistantServiceDefinition,
): ServiceTargetPolicy {
  const targetDomains = new Set<string>();
  const target = definition.target;
  const targetEntity =
    target && typeof target === 'object' && !Array.isArray(target)
      ? (target as Record<string, unknown>).entity
      : undefined;

  if (Array.isArray(targetEntity)) {
    for (const entry of targetEntity) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        collectDomains((entry as Record<string, unknown>).domain, targetDomains);
      }
    }
    // Home Assistant occasionally publishes an entity target without a domain
    // restriction. Keep that fallback narrow instead of trusting every domain.
    if (targetDomains.size === 0) targetDomains.add(serviceDomain.toLowerCase());
  }

  const dataEntityFields = new Map<string, EntityFieldPolicy>();
  for (const [name, field] of Object.entries(definition.fields ?? {})) {
    const entityPolicy = selectorEntityPolicy(field.selector);
    if (entityPolicy) dataEntityFields.set(name, entityPolicy);
  }

  // Some legacy services (for example older TTS services) put their only
  // target in a field named entity_id rather than in target.entity. The public
  // request still uses root entity_id, which is validated and forwarded safely.
  if (targetDomains.size === 0) {
    const legacyEntityId = dataEntityFields.get('entity_id');
    if (legacyEntityId && legacyEntityId.allowedDomains.size > 0) {
      for (const domain of legacyEntityId.allowedDomains) targetDomains.add(domain);
    }
  }
  dataEntityFields.delete('entity_id');

  return { targetDomains, dataEntityFields };
}
