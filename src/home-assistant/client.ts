import type { GatewayConfig } from '../config/env.js';
import type {
  HomeAssistantConfig,
  HomeAssistantServiceDomain,
  HomeAssistantState,
  ServiceCallRequest,
} from './types.js';

export class HomeAssistantError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HomeAssistantError';
  }
}

export class HomeAssistantClient {
  constructor(
    private readonly config: GatewayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.config.homeAssistantUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.homeAssistantToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    let payload: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      throw new HomeAssistantError(
        `Home Assistant returned HTTP ${response.status}`,
        response.status,
        payload,
      );
    }

    return payload as T;
  }

  async getConfig(): Promise<HomeAssistantConfig> {
    return this.request<HomeAssistantConfig>('/api/config');
  }

  async getServices(): Promise<HomeAssistantServiceDomain[]> {
    return this.request<HomeAssistantServiceDomain[]>('/api/services');
  }

  async getStates(): Promise<HomeAssistantState[]> {
    return this.request<HomeAssistantState[]>('/api/states');
  }

  async getState(entityId: string): Promise<HomeAssistantState> {
    return this.request<HomeAssistantState>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  async callService(request: ServiceCallRequest): Promise<unknown> {
    const body: Record<string, unknown> = { ...(request.data ?? {}) };
    body.entity_id = request.entity_id;

    return this.request(`/api/services/${encodeURIComponent(request.domain)}/${encodeURIComponent(request.service)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
