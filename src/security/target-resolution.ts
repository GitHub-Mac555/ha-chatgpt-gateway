import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { getEntityDomain, isEntityAllowed } from './authorization.js';

const MAX_TARGET_DEPTH = 8;
const MAX_RESOLVED_ENTITIES = 100;

export interface TargetResolutionFailure {
  statusCode: 400 | 403;
  error: 'invalid_request' | 'forbidden';
  message: string;
}

export interface TargetResolutionSuccess {
  entityIds: string[];
}

export type TargetResolutionResult = TargetResolutionSuccess | TargetResolutionFailure;

function failure(
  statusCode: TargetResolutionFailure['statusCode'],
  error: TargetResolutionFailure['error'],
  message: string,
): TargetResolutionFailure {
  return { statusCode, error, message };
}

function getMemberEntityIds(attributes: Record<string, unknown> | undefined): string[] | undefined {
  const rawMembers = attributes?.entity_id;
  if (rawMembers === undefined) return undefined;
  if (typeof rawMembers === 'string') return [rawMembers.toLowerCase()];
  if (
    Array.isArray(rawMembers) &&
    rawMembers.length > 0 &&
    rawMembers.every((member) => typeof member === 'string')
  ) {
    return rawMembers.map((member) => member.toLowerCase());
  }
  return [];
}

/**
 * Resolve Home Assistant group-like entity targets before a write. A caller
 * may only target entities that are individually allowed, including every
 * entity reached through an allowed group. The returned IDs are concrete
 * targets, never the group-like source entity.
 */
export async function resolveServiceEntityTargets(
  client: HomeAssistantClient,
  config: GatewayConfig,
  domain: string,
  targetEntityIds: string[],
): Promise<TargetResolutionResult> {
  const resolved = new Set<string>();
  const cache = new Map<string, string[]>();

  const expand = async (
    entityId: string,
    ancestors: ReadonlySet<string>,
    depth: number,
  ): Promise<string[] | TargetResolutionFailure> => {
    const normalizedEntityId = entityId.toLowerCase();
    if (depth > MAX_TARGET_DEPTH) {
      return failure(400, 'invalid_request', 'Target nesting exceeds the maximum depth.');
    }
    if (ancestors.has(normalizedEntityId)) {
      return failure(400, 'invalid_request', 'Target group contains a cycle.');
    }
    if (getEntityDomain(normalizedEntityId) !== domain) {
      return failure(
        400,
        'invalid_request',
        'Every resolved entity_id domain must match the service domain.',
      );
    }
    if (!isEntityAllowed(config, normalizedEntityId)) {
      return failure(
        403,
        'forbidden',
        'One or more resolved entities are not allowed by the gateway policy.',
      );
    }

    const cached = cache.get(normalizedEntityId);
    if (cached) return cached;

    const state = await client.getState(normalizedEntityId);
    const members = getMemberEntityIds(state.attributes);
    if (members === undefined) {
      cache.set(normalizedEntityId, [normalizedEntityId]);
      return [normalizedEntityId];
    }
    if (members.length === 0) {
      return failure(400, 'invalid_request', 'Target group has no valid concrete entity IDs.');
    }

    const nextAncestors = new Set(ancestors).add(normalizedEntityId);
    const concreteMembers: string[] = [];
    for (const member of members) {
      const expanded = await expand(member, nextAncestors, depth + 1);
      if ('error' in expanded) return expanded;
      concreteMembers.push(...expanded);
      if (concreteMembers.length > MAX_RESOLVED_ENTITIES) {
        return failure(400, 'invalid_request', 'Target resolves to too many entities.');
      }
    }

    const uniqueMembers = [...new Set(concreteMembers)];
    cache.set(normalizedEntityId, uniqueMembers);
    return uniqueMembers;
  };

  for (const targetEntityId of targetEntityIds) {
    const expanded = await expand(targetEntityId, new Set(), 0);
    if ('error' in expanded) return expanded;
    for (const entityId of expanded) {
      resolved.add(entityId);
      if (resolved.size > MAX_RESOLVED_ENTITIES) {
        return failure(400, 'invalid_request', 'Target resolves to too many entities.');
      }
    }
  }

  if (resolved.size === 0) {
    return failure(400, 'invalid_request', 'Target resolves to no concrete entities.');
  }

  return { entityIds: [...resolved] };
}
