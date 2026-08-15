import { APP_VERSION } from '../version.js';

const errorResponses = {
  '400': { description: 'Invalid request' },
  '401': { description: 'Missing or invalid gateway API key' },
  '403': { description: 'Blocked by gateway policy' },
  '429': { description: 'Rate limit exceeded' },
  '502': { description: 'Home Assistant returned an unexpected response' },
  '503': { description: 'Home Assistant is unavailable or timed out' },
};

const entityIdParameter = {
  name: 'entityId',
  in: 'path',
  required: true,
  schema: { type: 'string', examples: ['light.living_room'] },
};

export function buildOpenApiSchema(publicBaseUrl?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'HA ChatGPT Gateway',
      version: APP_VERSION,
      description:
        'A policy-enforced self-hosted REST gateway for a ChatGPT GPT Action. Use only this API; never send Home Assistant credentials to it.',
    },
    ...(publicBaseUrl ? { servers: [{ url: publicBaseUrl }] } : {}),
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'getGatewayHealth',
          summary: 'Check gateway liveness',
          security: [],
          responses: { '200': { description: 'Gateway is running' } },
        },
      },
      '/api/v1/config': {
        get: {
          operationId: 'getHomeAssistantConfig',
          summary: 'Get safe Home Assistant and gateway configuration',
          responses: { '200': { description: 'Safe configuration summary' }, ...errorResponses },
        },
      },
      '/api/v1/diagnostics': {
        get: {
          operationId: 'getGatewayDiagnostics',
          summary: 'Check authenticated connectivity to Home Assistant',
          responses: { '200': { description: 'Connectivity diagnostics' }, ...errorResponses },
        },
      },
      '/api/v1/entities': {
        get: {
          operationId: 'listHomeAssistantEntities',
          summary: 'Discover allowed controllable entities',
          description:
            'Use filters to identify a device before reading it or calling an allowed service.',
          parameters: [
            { name: 'domain', in: 'query', schema: { type: 'string', examples: ['light'] } },
            { name: 'name', in: 'query', schema: { type: 'string', examples: ['living room'] } },
            { name: 'state', in: 'query', schema: { type: 'string', examples: ['on'] } },
            {
              name: 'device_class',
              in: 'query',
              schema: { type: 'string', examples: ['temperature'] },
            },
          ],
          responses: {
            '200': {
              description: 'Entities that satisfy the gateway policy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      entities: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/DiscoveryEntity' },
                      },
                    },
                    required: ['entities'],
                  },
                },
              },
            },
            ...errorResponses,
          },
        },
      },
      '/api/v1/entities/{entityId}': {
        get: {
          operationId: 'getHomeAssistantEntity',
          summary: 'Get full state and attributes for one allowed entity',
          parameters: [entityIdParameter],
          responses: {
            '200': {
              description: 'Entity state',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/EntityState' } },
              },
            },
            '404': { description: 'Entity not found' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/entities/{entityId}/state': {
        get: {
          operationId: 'getHomeAssistantEntityState',
          summary: 'Get only current state and timestamps for one allowed entity',
          parameters: [entityIdParameter],
          responses: {
            '200': { description: 'Entity state summary' },
            '404': { description: 'Entity not found' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/areas': {
        get: {
          operationId: 'listHomeAssistantAreas',
          summary: 'List areas associated with allowed entities',
          description:
            'Area metadata comes from Home Assistant’s internal registry; only areas related to allowed entities are returned.',
          responses: { '200': { description: 'Allowed areas' }, ...errorResponses },
        },
      },
      '/api/v1/devices': {
        get: {
          operationId: 'listHomeAssistantDevices',
          summary: 'List devices associated with allowed entities',
          description:
            'Device metadata comes from Home Assistant’s internal registry; only devices related to allowed entities are returned.',
          responses: { '200': { description: 'Allowed devices' }, ...errorResponses },
        },
      },
      '/api/v1/services': {
        get: {
          operationId: 'listHomeAssistantServices',
          summary: 'Discover services available in allowed Home Assistant domains',
          parameters: [
            { name: 'domain', in: 'query', schema: { type: 'string', examples: ['light'] } },
          ],
          responses: {
            '200': { description: 'Dynamic service definitions from Home Assistant' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/services/call': {
        post: {
          operationId: 'callHomeAssistantService',
          summary: 'Call an allowed Home Assistant service for explicit allowed entities',
          description:
            'This changes Home Assistant state and is disabled when READ_ONLY=true. An explicit entity_id or target.entity_id is required. device_id, area_id, label_id, and global calls are intentionally rejected.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ServiceCall' } },
            },
          },
          responses: { '200': { description: 'Service call completed' }, ...errorResponses },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API key',
          description: 'Use the GATEWAY_API_KEY only. Do not use a Home Assistant token.',
        },
      },
      schemas: {
        EntityState: {
          type: 'object',
          properties: {
            entity_id: { type: 'string' },
            state: { type: 'string' },
            attributes: { type: 'object', additionalProperties: true },
            last_changed: { type: 'string' },
            last_updated: { type: 'string' },
          },
          required: ['entity_id', 'state', 'attributes', 'last_changed', 'last_updated'],
        },
        DiscoveryEntity: {
          type: 'object',
          properties: {
            entity_id: { type: 'string' },
            friendly_name: { type: 'string' },
            domain: { type: 'string' },
            state: { type: 'string' },
            attributes: { type: 'object', additionalProperties: true },
            last_changed: { type: 'string' },
            last_updated: { type: 'string' },
          },
          required: [
            'entity_id',
            'friendly_name',
            'domain',
            'state',
            'attributes',
            'last_changed',
            'last_updated',
          ],
        },
        ServiceCall: {
          type: 'object',
          properties: {
            domain: { type: 'string', examples: ['light'] },
            service: { type: 'string', examples: ['turn_on'] },
            entity_id: {
              oneOf: [
                { type: 'string', examples: ['light.living_room'] },
                { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' } },
              ],
            },
            target: {
              type: 'object',
              properties: {
                entity_id: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' } },
                  ],
                },
              },
              required: ['entity_id'],
              additionalProperties: false,
            },
            data: {
              type: 'object',
              additionalProperties: true,
              examples: [{ brightness_pct: 50 }],
            },
          },
          required: ['domain', 'service'],
          oneOf: [{ required: ['entity_id'] }, { required: ['target'] }],
          additionalProperties: false,
        },
      },
    },
  } as const;
}
