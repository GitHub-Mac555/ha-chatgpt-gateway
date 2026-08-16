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
  returnResponse?: boolean;
}

export interface HomeAssistantArea {
  area_id: string;
  name: string;
  aliases?: string[];
}

export interface HomeAssistantDevice {
  id: string;
  area_id?: string | null;
  name_by_user?: string | null;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  disabled_by?: string | null;
}

export interface HomeAssistantEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  disabled_by?: string | null;
  hidden_by?: string | null;
}
