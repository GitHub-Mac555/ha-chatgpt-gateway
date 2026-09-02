import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { invalidRequest } from '../http/errors.js';
import { isEntityAllowed } from '../security/authorization.js';

const MAX_LOGBOOK_DAYS = 7;
const MAX_LOGBOOK_ENTRIES = 500;
const DEFAULT_ERROR_LOG_LINES = 200;
const MAX_ERROR_LOG_LINES = 1000;
const MAX_ERROR_LOG_LINE_LENGTH = 4000;

const errorLogQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(MAX_ERROR_LOG_LINES).default(DEFAULT_ERROR_LOG_LINES),
});

const logbookQuerySchema = z.object({
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }).optional(),
  entity_id: z.string().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LOGBOOK_ENTRIES).default(200),
});

const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|api[_-]?key|webhook/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\b\s*[:=]\s*[^\s,;]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

function redactText(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitive(item, depth + 1),
    ]),
  );
}

function normalizeErrorLog(log: string, lines: number): { lines: string[]; truncated: boolean } {
  const allLines = log.split(/\r?\n/);
  const selected = allLines.slice(-lines);
  return {
    lines: selected.map((line) =>
      redactText(
        line.length > MAX_ERROR_LOG_LINE_LENGTH
          ? `${line.slice(0, MAX_ERROR_LOG_LINE_LENGTH)}…[TRUNCATED]`
          : line,
      ),
    ),
    truncated: selected.length < allLines.length,
  };
}

function getLogbookEntityId(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  const entityId = (entry as Record<string, unknown>).entity_id;
  return typeof entityId === 'string' ? entityId : undefined;
}

export async function registerLogRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  client: HomeAssistantClient,
): Promise<void> {
  app.get('/api/v1/logs/errors', async (request, reply) => {
    const queryResult = errorLogQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send(invalidRequest(queryResult.error.issues));
    }

    const normalized = normalizeErrorLog(await client.getErrorLog(), queryResult.data.lines);
    return {
      source: 'home_assistant_error_log',
      requested_lines: queryResult.data.lines,
      returned_lines: normalized.lines.length,
      truncated: normalized.truncated,
      lines: normalized.lines,
    };
  });

  app.get('/api/v1/logbook', async (request, reply) => {
    const queryResult = logbookQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send(invalidRequest(queryResult.error.issues));
    }

    const startTime = new Date(queryResult.data.start_time);
    const endTime = new Date(queryResult.data.end_time ?? new Date().toISOString());
    if (
      endTime <= startTime ||
      endTime.getTime() - startTime.getTime() > MAX_LOGBOOK_DAYS * 86_400_000
    ) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: `Logbook ranges must be positive and no longer than ${MAX_LOGBOOK_DAYS} days.`,
      });
    }

    const requestedEntityId = queryResult.data.entity_id;
    if (requestedEntityId && !isEntityAllowed(config, requestedEntityId)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Entity is not allowed.' });
    }

    const raw = await client.getLogbook(
      startTime.toISOString(),
      endTime.toISOString(),
      requestedEntityId,
    );
    const entries = Array.isArray(raw) ? raw : [];
    const allowedEntries = entries.filter((entry) => {
      const entityId = getLogbookEntityId(entry);
      return entityId !== undefined && isEntityAllowed(config, entityId);
    });
    const limitedEntries = allowedEntries.slice(0, queryResult.data.limit);

    return {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      entity_id: requestedEntityId ?? null,
      total_allowed_entries: allowedEntries.length,
      returned_entries: limitedEntries.length,
      truncated: limitedEntries.length < allowedEntries.length,
      entries: redactSensitive(limitedEntries),
    };
  });
}
