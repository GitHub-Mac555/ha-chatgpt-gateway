/* global AbortSignal, fetch */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const DEFAULT_LINES = 100;
const MAX_LINES = 500;
const MAX_SUPERVISOR_BYTES = 1024 * 1024;
const MAX_LINE_CHARS = 24_576;
const MAX_REQUESTS = 30;
const RATE_WINDOW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const ERROR_LINE_PATTERN = /\b(?:warning|warn|error|err|critical|fatal)\b/i;

const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;}]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
  /(\/api\/webhook\/)[A-Za-z0-9._~-]+/gi,
  /([?&](?:access[_-]?token|api[_-]?key|password|secret|token)=)[^&#\s]+/gi,
];

export function redactSensitiveText(value) {
  return value
    .replace(SENSITIVE_TEXT_PATTERNS[0], 'Bearer [REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERNS[1], '[REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERNS[2], '[REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERNS[3], '$1[REDACTED]@')
    .replace(SENSITIVE_TEXT_PATTERNS[4], '$1[REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERNS[5], '$1[REDACTED]');
}

function secureTokenMatches(actual, expected) {
  const actualDigest = createHash('sha256').update(actual).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function sendJson(response, statusCode, body, headers = {}) {
  const data = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(data);
}

async function readTextLimited(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_SUPERVISOR_BYTES) {
    throw new Error('Supervisor response exceeded the size limit');
  }
  if (!response.body) throw new Error('Supervisor returned an empty response');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SUPERVISOR_BYTES) {
      await reader.cancel();
      throw new Error('Supervisor response exceeded the size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

export async function fetchCoreErrorLogs({ lines, supervisorToken, fetchImpl = fetch }) {
  const url = new URL('http://supervisor/core/logs');
  url.searchParams.set('lines', String(lines));
  url.searchParams.set('no_colors', '');

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      accept: 'text/plain',
      authorization: `Bearer ${supervisorToken}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Supervisor log source request failed');

  const rawLines = (await readTextLimited(response)).split(/\r?\n/).filter(Boolean);
  const entries = rawLines
    .filter((line) => ERROR_LINE_PATTERN.test(line))
    .slice(-lines)
    .map(redactSensitiveText)
    .map((line) => line.slice(0, MAX_LINE_CHARS));

  return {
    source: 'home_assistant_core',
    requested_lines: lines,
    returned_lines: entries.length,
    truncated: rawLines.length >= lines,
    entries,
  };
}

export function createDiagnosticsServer({ diagnosticsToken, supervisorToken, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{64}$/i.test(diagnosticsToken)) {
    throw new Error('A 64-character hexadecimal diagnostics token is required');
  }
  if (!supervisorToken) throw new Error('Supervisor API access is unavailable');

  const rateLimits = new Map();
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }

    if (request.method !== 'GET' || url.pathname !== '/api/v1/logs/errors') {
      return sendJson(response, 404, { error: 'not_found', message: 'Route not found.' });
    }

    const now = Date.now();
    const remoteAddress = request.socket.remoteAddress ?? 'unknown';
    const existing = rateLimits.get(remoteAddress);
    const rate =
      !existing || existing.resetAt <= now ? { count: 0, resetAt: now + RATE_WINDOW_MS } : existing;
    rate.count += 1;
    rateLimits.set(remoteAddress, rate);
    if (rateLimits.size > 1024) rateLimits.delete(rateLimits.keys().next().value);

    const rateHeaders = {
      'ratelimit-limit': String(MAX_REQUESTS),
      'ratelimit-remaining': String(Math.max(0, MAX_REQUESTS - rate.count)),
      'ratelimit-reset': String(Math.ceil(rate.resetAt / 1000)),
    };
    if (rate.count > MAX_REQUESTS) {
      return sendJson(
        response,
        429,
        { error: 'rate_limited', message: 'Too many requests. Try again shortly.' },
        { ...rateHeaders, 'retry-after': String(Math.ceil((rate.resetAt - now) / 1000)) },
      );
    }

    const authorization = request.headers.authorization ?? '';
    const prefix = 'Bearer ';
    const suppliedToken = authorization.startsWith(prefix)
      ? authorization.slice(prefix.length)
      : '';
    if (!secureTokenMatches(suppliedToken, diagnosticsToken)) {
      return sendJson(
        response,
        401,
        { error: 'unauthorized', message: 'Missing or invalid bearer token.' },
        rateHeaders,
      );
    }

    if ([...url.searchParams.keys()].some((key) => key !== 'lines')) {
      return sendJson(
        response,
        400,
        { error: 'invalid_request', message: 'Only the lines query parameter is supported.' },
        rateHeaders,
      );
    }
    const lineValues = url.searchParams.getAll('lines');
    const rawLines = lineValues[0] ?? String(DEFAULT_LINES);
    if (lineValues.length > 1 || !/^[1-9]\d{0,2}$/.test(rawLines)) {
      return sendJson(
        response,
        400,
        { error: 'invalid_request', message: 'lines must be an integer from 1 to 500.' },
        rateHeaders,
      );
    }
    const lines = Number(rawLines);
    if (lines > MAX_LINES) {
      return sendJson(
        response,
        400,
        { error: 'invalid_request', message: 'lines must be an integer from 1 to 500.' },
        rateHeaders,
      );
    }

    try {
      return sendJson(
        response,
        200,
        await fetchCoreErrorLogs({ lines, supervisorToken, fetchImpl }),
        rateHeaders,
      );
    } catch {
      return sendJson(
        response,
        503,
        {
          error: 'log_source_unavailable',
          message: 'The Home Assistant log source is unavailable.',
        },
        rateHeaders,
      );
    }
  });
}

async function main() {
  const options = JSON.parse(await readFile('/data/options.json', 'utf8'));
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    process.setgid('node');
    process.setuid('node');
  }
  const server = createDiagnosticsServer({
    diagnosticsToken: options.diagnostics_token,
    supervisorToken: process.env.SUPERVISOR_TOKEN,
  });
  server.listen(8099, '0.0.0.0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    let category = 'startup_failed';
    if (error?.code === 'EACCES') category = 'configuration_unreadable';
    else if (error instanceof SyntaxError) category = 'configuration_invalid_json';
    else if (error?.message === 'Invalid diagnostics token configuration') {
      category = 'configuration_invalid_token';
    } else if (error?.message === 'Supervisor API access is unavailable') {
      category = 'supervisor_token_unavailable';
    }
    console.error(`Diagnostics companion failed to start (${category}).`);
    process.exit(1);
  });
}
