import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOME_ASSISTANT_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), 'HOME_ASSISTANT_URL must use HTTP or HTTPS'),
  HOME_ASSISTANT_TOKEN: z.string().min(1, 'HOME_ASSISTANT_TOKEN is required'),
  GATEWAY_API_KEY: z.string().min(16, 'GATEWAY_API_KEY must contain at least 16 characters'),
  ALLOWED_DOMAINS: z.string().min(1, 'ALLOWED_DOMAINS is required'),
  ALLOWED_ENTITIES: z.string().default(''),
  READ_ONLY: booleanFromString,
  LOG_LEVEL: logLevelSchema.default('info'),
  HOME_ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).max(10_000).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

export interface GatewayConfig {
  port: number;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  gatewayApiKey: string;
  allowedDomains: ReadonlySet<string>;
  allowedEntities: ReadonlySet<string>;
  readOnly: boolean;
  logLevel: z.infer<typeof logLevelSchema>;
  homeAssistantTimeoutMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  publicBaseUrl?: string;
}

function parseCsv(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = envSchema.parse(env);
  const allowedDomains = parseCsv(parsed.ALLOWED_DOMAINS);

  if (allowedDomains.size === 0) {
    throw new Error('ALLOWED_DOMAINS must contain at least one domain');
  }

  return {
    port: parsed.PORT,
    homeAssistantUrl: parsed.HOME_ASSISTANT_URL.replace(/\/$/, ''),
    homeAssistantToken: parsed.HOME_ASSISTANT_TOKEN,
    gatewayApiKey: parsed.GATEWAY_API_KEY,
    allowedDomains,
    allowedEntities: parseCsv(parsed.ALLOWED_ENTITIES),
    readOnly: parsed.READ_ONLY,
    logLevel: parsed.LOG_LEVEL,
    homeAssistantTimeoutMs: parsed.HOME_ASSISTANT_TIMEOUT_MS,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    publicBaseUrl: parsed.PUBLIC_BASE_URL?.replace(/\/$/, ''),
  };
}
