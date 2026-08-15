import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOME_ASSISTANT_URL: z.string().url(),
  HOME_ASSISTANT_TOKEN: z.string().min(1, 'HOME_ASSISTANT_TOKEN is required'),
  GATEWAY_API_KEY: z.string().min(16, 'GATEWAY_API_KEY must contain at least 16 characters'),
  ALLOWED_DOMAINS: z.string().default('light,switch,scene,script,climate,cover'),
  ALLOWED_ENTITIES: z.string().default(''),
  READ_ONLY: booleanFromString,
  LOG_LEVEL: logLevelSchema.default('info'),
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

  return {
    port: parsed.PORT,
    homeAssistantUrl: parsed.HOME_ASSISTANT_URL.replace(/\/$/, ''),
    homeAssistantToken: parsed.HOME_ASSISTANT_TOKEN,
    gatewayApiKey: parsed.GATEWAY_API_KEY,
    allowedDomains: parseCsv(parsed.ALLOWED_DOMAINS),
    allowedEntities: parseCsv(parsed.ALLOWED_ENTITIES),
    readOnly: parsed.READ_ONLY,
    logLevel: parsed.LOG_LEVEL,
  };
}
