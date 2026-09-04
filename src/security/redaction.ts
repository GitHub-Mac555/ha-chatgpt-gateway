const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|api[_-]?key|webhook/i;

const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /["']?(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)["']?\s*[:=]\s*["']?[^"'\s,;}]+["']?/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

export function redactSensitiveText(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 16) {
    return '[TRUNCATED]';
  }
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitive(item, depth + 1),
    ]),
  );
}
