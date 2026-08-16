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
      '/api/v1/entities/{entityId}/history': {
        get: {
          operationId: 'getHomeAssistantEntityHistory',
          summary: 'Get bounded history for one allowed entity',
          description:
            'Use for evidence-based analysis of one allowed sensor or entity. A start_time is required; the range is limited to 31 days and Home Assistant attributes are excluded.',
          parameters: [
            entityIdParameter,
            {
              name: 'start_time',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date-time', examples: ['2026-08-01T00:00:00Z'] },
            },
            {
              name: 'end_time',
              in: 'query',
              schema: { type: 'string', format: 'date-time', examples: ['2026-08-08T00:00:00Z'] },
            },
            {
              name: 'max_points',
              in: 'query',
              schema: { type: 'integer', minimum: 2, maximum: 5000, default: 1000 },
            },
          ],
          responses: {
            '200': { description: 'Minimal state history for the requested entity' },
            '404': { description: 'Entity not found' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/automations/{entityId}': {
        get: {
          operationId: 'getHomeAssistantAutomationConfig',
          summary: 'Get redacted configuration for one allowed automation entity',
          description:
            'Use after discovering an allowed automation entity. Sensitive config values such as tokens, passwords, API keys, authorization values, and webhooks are redacted.',
          parameters: [entityIdParameter],
          responses: {
            '200': { description: 'Automation configuration with sensitive values redacted' },
            '404': { description: 'Automation configuration not found' },
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
          description:
            'Use this for broad discovery. For a command with parameters, then read the precise service contract for the selected domain and service.',
          parameters: [
            { name: 'domain', in: 'query', schema: { type: 'string', examples: ['light'] } },
          ],
          responses: {
            '200': { description: 'Dynamic service definitions from Home Assistant' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/services/{domain}/{service}': {
        get: {
          operationId: 'getHomeAssistantServiceContract',
          summary: 'Get the live input contract for one allowed Home Assistant service',
          description:
            'Use before a parameterized command. The contract comes from Home Assistant and identifies supported fields, required fields, examples, and selectors for this service.',
          parameters: [
            {
              name: 'domain',
              in: 'path',
              required: true,
              schema: { type: 'string', examples: ['climate'] },
            },
            {
              name: 'service',
              in: 'path',
              required: true,
              schema: { type: 'string', examples: ['set_temperature'] },
            },
          ],
          responses: {
            '200': {
              description: 'Live Home Assistant service contract',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { service: { $ref: '#/components/schemas/ServiceContract' } },
                    required: ['service'],
                  },
                },
              },
            },
            '404': { description: 'Service not found' },
            ...errorResponses,
          },
        },
      },
      '/api/v1/services/call': {
        post: {
          operationId: 'callHomeAssistantService',
          summary: 'Call one allowed Home Assistant service for explicit allowed entities',
          description:
            'This changes Home Assistant state and is disabled when READ_ONLY=true. Pass entity_id as an array even for one entity. For dynamic Home Assistant parameters, put one JSON object in data_json after reading the live service contract. device_id, area_id, label_id, and global calls are intentionally rejected.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ServiceCall' } },
            },
          },
          responses: { '200': { description: 'Service call completed' }, ...errorResponses },
        },
      },
      '/api/v1/services/batch': {
        post: {
          operationId: 'callHomeAssistantServiceBatch',
          summary: 'Run a short, ordered batch of allowed Home Assistant service calls',
          description:
            'Use only when one user request needs multiple service calls, such as HVAC mode, temperature, and fan mode. Every call and every entity is validated before execution. Calls run sequentially and stop on the first Home Assistant error; batches are not transactional and cannot roll back an already completed call.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ServiceBatch' } },
            },
          },
          responses: { '200': { description: 'All service calls completed' }, ...errorResponses },
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
            domain: { type: 'string', examples: ['climate'] },
            service: { type: 'string', examples: ['set_temperature'] },
            entity_id: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { type: 'string' },
              examples: [['climate.bedroom_air_conditioner']],
            },
            data_json: {
              type: 'string',
              description:
                'Optional JSON object of service parameters. Use field names and allowed values from getHomeAssistantServiceContract. Do not include entity_id or target fields here.',
              examples: ['{"temperature":27}'],
            },
          },
          required: ['domain', 'service', 'entity_id'],
          additionalProperties: false,
        },
        ServiceBatch: {
          type: 'object',
          properties: {
            calls: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              items: { $ref: '#/components/schemas/ServiceCall' },
              examples: [
                [
                  {
                    domain: 'climate',
                    service: 'set_hvac_mode',
                    entity_id: ['climate.bedroom_air_conditioner'],
                    data_json: '{"hvac_mode":"cool"}',
                  },
                  {
                    domain: 'climate',
                    service: 'set_temperature',
                    entity_id: ['climate.bedroom_air_conditioner'],
                    data_json: '{"temperature":27}',
                  },
                  {
                    domain: 'climate',
                    service: 'set_fan_mode',
                    entity_id: ['climate.bedroom_air_conditioner'],
                    data_json: '{"fan_mode":"medium"}',
                  },
                ],
              ],
            },
          },
          required: ['calls'],
          additionalProperties: false,
        },
        ServiceContract: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            service: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            target: { type: 'object', additionalProperties: true },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  required: { type: 'boolean' },
                  example: {},
                  selector: { type: 'object', additionalProperties: true },
                },
                required: ['name', 'required'],
              },
            },
          },
          required: ['domain', 'service', 'fields'],
        },
      },
    },
  } as const;
}
