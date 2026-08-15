import type { ZodIssue } from 'zod';

export function invalidRequest(issues: readonly ZodIssue[]) {
  return {
    error: 'invalid_request',
    issues: issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
