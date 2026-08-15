export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_reported?: string;
  last_updated: string;
  context?: Record<string, unknown>;
}

export interface HomeAssistantServiceField {
  name?: string;
  description?: string;
  required?: boolean;
  example?: unknown;
  selector?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HomeAssistantServiceDefinition {
  name?: string;
  description?: string;
  fields?: Record<string, HomeAssistantServiceField>;
  target?: Record<string, unknown>;
  response?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HomeAssistantServiceDomain {
  domain: string;
  services: Record<string, HomeAssistantServiceDefinition>;
}

export interface HomeAssistantConfig {
  location_name?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  unit_system?: Record<string, unknown>;
  time_zone?: string;
  version?: string;
  state?: string;
  [key: string]: unknown;
}

export interface ServiceCallRequest {
  domain: string;
  service: string;
  entity_id: string | string[];
  data?: Record<string, unknown>;
}
