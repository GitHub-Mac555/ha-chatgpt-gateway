import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayConfig } from '../config/env.js';
import type { HomeAssistantClient } from '../home-assistant/client.js';
import { invalidRequest } from '../http/errors.js';
import { isEntityAllowed } from '../security/authorization.js';
import { redactSensitive, redactSensitiveText } from '../security/redaction.js';

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
  include_state: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

function normalizeErrorLog(log: string, lines: number): { lines: string[]; truncated: boolean } {
  const allLines = log.split(/\r?\n/);
  const selected = allLines.slice(-lines);
  return {
    lines: selected.map((line) =>
      redactSensitiveText(
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
  if (config.errorLogsEnabled) {
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
  }

  if (config.logbookEnabled) {
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
      const minimizedEntries = queryResult.data.include_state
        ? limitedEntries
        : limitedEntries.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
            const { state: _state, ...rest } = entry as Record<string, unknown>;
            return rest;
          });

      return {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        entity_id: requestedEntityId ?? null,
        include_state: queryResult.data.include_state,
        total_allowed_entries: allowedEntries.length,
        returned_entries: limitedEntries.length,
        truncated: limitedEntries.length < allowedEntries.length,
        entries: redactSensitive(minimizedEntries),
      };
    });
  }
}
