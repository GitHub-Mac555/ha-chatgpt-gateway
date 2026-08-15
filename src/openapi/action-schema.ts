export function buildOpenApiSchema() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'HA ChatGPT Gateway',
      version: '0.1.0',
      description:
        'A constrained self-hosted API for connecting a ChatGPT GPT Action to Home Assistant.',
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'getGatewayHealth',
          summary: 'Check gateway health',
          security: [],
          responses: {
            '200': {
              description: 'Gateway is running',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      version: { type: 'string' },
                      readOnly: { type: 'boolean' },
                    },
                    required: ['status', 'version', 'readOnly'],
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/config': {
        get: {
          operationId: 'getHomeAssistantConfig',
          summary: 'Get safe Home Assistant and gateway configuration information',
          responses: { '200': { description: 'Configuration summary' } },
        },
      },
      '/api/v1/services': {
        get: {
          operationId: 'listHomeAssistantServices',
          summary: 'List services available in allowed Home Assistant domains',
          parameters: [{ name: 'domain', in: 'query', required: false, schema: { type: 'string' }, description: 'Optional allowed Home Assistant domain filter.' }],
          responses: { '200': { description: 'Allowed service definitions' } },
        },
      },
      '/api/v1/diagnostics': {
        get: {
          operationId: 'getGatewayDiagnostics',
          summary: 'Check authenticated connectivity to Home Assistant',
          responses: { '200': { description: 'Gateway and Home Assistant diagnostics' } },
        },
      },
      '/api/v1/entities': {
        get: {
          operationId: 'listHomeAssistantEntities',
          summary: 'List Home Assistant entities allowed by the gateway policy',
          parameters: [{ name: 'domain', in: 'query', required: false, schema: { type: 'string' }, description: 'Optional Home Assistant domain filter such as light or switch.' }],
          responses: {
            '200': {
              description: 'Allowed entities',
              content: { 'application/json': { schema: { type: 'object', properties: { entities: { type: 'array', items: { $ref: '#/components/schemas/EntityState' } } }, required: ['entities'] } } },
            },
          },
        },
      },
      '/api/v1/entities/{entityId}': {
        get: {
          operationId: 'getHomeAssistantEntity',
          summary: 'Get an allowed Home Assistant entity',
          parameters: [{ $ref: '#/components/parameters/EntityId' }],
          responses: {
            '200': { description: 'Entity state and attributes', content: { 'application/json': { schema: { $ref: '#/components/schemas/EntityState' } } } },
            '403': { description: 'Entity is not allowed' },
            '404': { description: 'Entity was not found' },
          },
        },
      },
      '/api/v1/entities/{entityId}/state': {
        get: {
          operationId: 'getHomeAssistantEntityState',
          summary: 'Get the current state of an allowed Home Assistant entity',
          parameters: [{ $ref: '#/components/parameters/EntityId' }],
          responses: {
            '200': {
              description: 'Entity state',
              content: { 'application/json': { schema: { type: 'object', properties: { entity_id: { type: 'string' }, state: { type: 'string' }, last_changed: { type: 'string' }, last_updated: { type: 'string' } }, required: ['entity_id', 'state', 'last_changed', 'last_updated'] } } },
            },
            '403': { description: 'Entity is not allowed' },
            '404': { description: 'Entity was not found' },
          },
        },
      },
      '/api/v1/services/call': {
        post: {
          operationId: 'callHomeAssistantService',
          summary: 'Call an allowed Home Assistant service',
          description: 'Changes Home Assistant state. This endpoint is disabled when READ_ONLY=true.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceCall' } } } },
          responses: { '200': { description: 'Service call completed' }, '403': { description: 'Domain/entity not allowed or gateway is read-only' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Use the GATEWAY_API_KEY value. Never use the Home Assistant token here.' },
      },
      parameters: {
        EntityId: { name: 'entityId', in: 'path', required: true, schema: { type: 'string', examples: ['light.living_room'] } },
      },
      schemas: {
        EntityState: {
          type: 'object',
          properties: { entity_id: { type: 'string' }, state: { type: 'string' }, attributes: { type: 'object', additionalProperties: true }, last_changed: { type: 'string' }, last_updated: { type: 'string' } },
          required: ['entity_id', 'state', 'attributes', 'last_changed', 'last_updated'],
        },
        ServiceCall: {
          type: 'object',
          properties: {
            domain: { type: 'string', examples: ['light'] },
            service: { type: 'string', examples: ['turn_on'] },
            entity_id: { oneOf: [{ type: 'string', examples: ['light.living_room'] }, { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' } }] },
            data: { type: 'object', additionalProperties: true },
          },
          required: ['domain', 'service', 'entity_id'],
          additionalProperties: false,
        },
      },
    },
  } as const;
}
