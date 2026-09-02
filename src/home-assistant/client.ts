import type { GatewayConfig } from '../config/env.js';
import type {
  HomeAssistantConfig,
  HomeAssistantArea,
  HomeAssistantDevice,
  HomeAssistantEntityRegistryEntry,
  HomeAssistantServiceDomain,
  HomeAssistantServiceDefinition,
  HomeAssistantState,
  ServiceCallRequest,
} from './types.js';

export class HomeAssistantError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
    public readonly kind: 'http' | 'unavailable' | 'timeout' = 'http',
  ) {
    super(message);
    this.name = 'HomeAssistantError';
  }
}

export interface WebSocketLike {
  addEventListener(type: 'message' | 'error', listener: (event: MessageEvent) => void): void;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

function createNativeWebSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

export class HomeAssistantClient {
  constructor(
    private readonly config: GatewayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly webSocketFactory: WebSocketFactory = createNativeWebSocket,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = this.config.homeAssistantTimeoutMs,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.homeAssistantUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.homeAssistantToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      const timedOut =
        controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      throw new HomeAssistantError(
        timedOut ? 'Home Assistant request timed out' : 'Home Assistant is unavailable',
        503,
        undefined,
        timedOut ? 'timeout' : 'unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }

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

  getServiceDefinition(
    services: HomeAssistantServiceDomain[],
    domain: string,
    service: string,
  ): HomeAssistantServiceDefinition | undefined {
    const serviceDomain = services.find((candidate) => candidate.domain.toLowerCase() === domain);
    return serviceDomain?.services[service];
  }

  async getStates(): Promise<HomeAssistantState[]> {
    return this.request<HomeAssistantState[]>('/api/states');
  }

  async getState(entityId: string): Promise<HomeAssistantState> {
    return this.request<HomeAssistantState>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  async getEntityHistory(entityId: string, startTime: string, endTime: string): Promise<unknown> {
    const query = new URLSearchParams({
      filter_entity_id: entityId,
      end_time: endTime,
      minimal_response: '',
      no_attributes: '',
    });
    return this.request(`/api/history/period/${encodeURIComponent(startTime)}?${query.toString()}`);
  }

  async getAutomationConfig(automationId: string): Promise<unknown> {
    return this.request(`/api/config/automation/config/${encodeURIComponent(automationId)}`);
  }

  async getLogbook(startTime: string, endTime: string, entityId?: string): Promise<unknown> {
    const query = new URLSearchParams({ end_time: endTime });
    if (entityId) {
      query.set('entity', entityId);
    }
    return this.request(
      `/api/logbook/${encodeURIComponent(startTime)}?${query.toString()}`,
    );
  }

  async callService(
    request: ServiceCallRequest,
    timeoutMs = this.config.homeAssistantServiceTimeoutMs,
  ): Promise<unknown> {
    const body: Record<string, unknown> = { ...(request.data ?? {}) };
    if (request.entity_id !== undefined) body.entity_id = request.entity_id;
    const query = request.returnResponse ? '?return_response' : '';

    return this.request(
      `/api/services/${encodeURIComponent(request.domain)}/${encodeURIComponent(request.service)}${query}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
  }

  private getWebSocketUrl(): string {
    const url = new URL(this.config.homeAssistantUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/websocket`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private async requestWebSocket<T>(type: string): Promise<T> {
    let socket: WebSocketLike;
    try {
      socket = this.webSocketFactory(this.getWebSocketUrl());
    } catch {
      throw new HomeAssistantError(
        'Home Assistant WebSocket is unavailable',
        503,
        undefined,
        'unavailable',
      );
    }

    return new Promise<T>((resolve, reject) => {
      let commandSent = false;
      const commandId = 1;
      const timeout = setTimeout(() => {
        socket.close();
        reject(
          new HomeAssistantError(
            'Home Assistant WebSocket request timed out',
            503,
            undefined,
            'timeout',
          ),
        );
      }, this.config.homeAssistantTimeoutMs);
      const finish = (callback: () => void) => {
        clearTimeout(timeout);
        socket.close();
        callback();
      };

      socket.addEventListener('error', () => {
        finish(() =>
          reject(
            new HomeAssistantError(
              'Home Assistant WebSocket is unavailable',
              503,
              undefined,
              'unavailable',
            ),
          ),
        );
      });
      socket.addEventListener('message', (event) => {
        let message: { type?: string; id?: number; success?: boolean; result?: T; error?: unknown };
        try {
          message = JSON.parse(String(event.data)) as typeof message;
        } catch {
          finish(() =>
            reject(new HomeAssistantError('Home Assistant WebSocket returned invalid data', 502)),
          );
          return;
        }

        if (message.type === 'auth_required') {
          socket.send(
            JSON.stringify({ type: 'auth', access_token: this.config.homeAssistantToken }),
          );
          return;
        }
        if (message.type === 'auth_invalid') {
          finish(() =>
            reject(new HomeAssistantError('Home Assistant WebSocket authentication failed', 401)),
          );
          return;
        }
        if (message.type === 'auth_ok' && !commandSent) {
          commandSent = true;
          socket.send(JSON.stringify({ id: commandId, type }));
          return;
        }
        if (message.type === 'result' && message.id === commandId) {
          if (message.success) {
            finish(() => resolve(message.result as T));
          } else {
            finish(() =>
              reject(
                new HomeAssistantError(
                  'Home Assistant WebSocket request failed',
                  502,
                  message.error,
                ),
              ),
            );
          }
        }
      });
    });
  }

  async getAreas(): Promise<HomeAssistantArea[]> {
    return this.requestWebSocket<HomeAssistantArea[]>('config/area_registry/list');
  }

  async getDevices(): Promise<HomeAssistantDevice[]> {
    return this.requestWebSocket<HomeAssistantDevice[]>('config/device_registry/list');
  }

  async getEntityRegistry(): Promise<HomeAssistantEntityRegistryEntry[]> {
    return this.requestWebSocket<HomeAssistantEntityRegistryEntry[]>('config/entity_registry/list');
  }
}
