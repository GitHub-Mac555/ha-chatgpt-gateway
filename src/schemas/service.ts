import { z } from 'zod';

const homeAssistantName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_]+$/i, 'Only letters, numbers and underscores are allowed');

const entityIdSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i, 'Invalid Home Assistant entity_id')
  .transform((value) => value.toLowerCase());

const entityIdsSchema = z.union([entityIdSchema, z.array(entityIdSchema).min(1).max(50)]);
const actionEntityIdsSchema = z.array(entityIdSchema).min(1).max(50);

const targetSchema = z
  .object({
    entity_id: entityIdsSchema.optional(),
    device_id: z.array(z.string().min(1).max(255)).min(1).max(50).optional(),
    area_id: z.array(z.string().min(1).max(255)).min(1).max(50).optional(),
    label_id: z.array(z.string().min(1).max(255)).min(1).max(50).optional(),
  })
  .strict();

const dataSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (data) =>
      !['entity_id', 'target', 'device_id', 'area_id', 'label_id'].some((key) => key in data),
    'Use entity_id or target at the request root; target fields inside data are not permitted.',
  );

const dataJsonSchema = z.string().min(2).max(65_536);

export const serviceCallSchema = z
  .object({
    domain: homeAssistantName.transform((value) => value.toLowerCase()),
    service: homeAssistantName.transform((value) => value.toLowerCase()),
    entity_id: entityIdsSchema.optional(),
    target: targetSchema.optional(),
    data: dataSchema.optional(),
    data_json: dataJsonSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.data !== undefined && value.data_json !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Specify data or data_json, not both.',
      });
    }
    if (value.entity_id && value.target?.entity_id) {
      context.addIssue({
        code: 'custom',
        message: 'Specify entity_id or target.entity_id, not both.',
      });
    }
    if (
      !value.entity_id &&
      !value.target?.entity_id &&
      !value.target?.device_id &&
      !value.target?.area_id &&
      !value.target?.label_id
    ) {
      context.addIssue({ code: 'custom', message: 'An explicit target is required.' });
    }
  });

export type ServiceCallInput = z.infer<typeof serviceCallSchema>;

/**
 * A deliberately simple input shape for GPT Actions. JSON service data is a
 * string because Home Assistant service fields are discovered dynamically and
 * cannot be fully represented by a static OpenAPI request schema.
 */
export const actionServiceCallSchema = z
  .object({
    domain: homeAssistantName.transform((value) => value.toLowerCase()),
    service: homeAssistantName.transform((value) => value.toLowerCase()),
    entity_id: actionEntityIdsSchema,
    data_json: dataJsonSchema.optional(),
  })
  .strict();

export const serviceBatchSchema = z
  .object({
    calls: z.array(actionServiceCallSchema).min(1).max(10),
  })
  .strict();

export type ActionServiceCallInput = z.infer<typeof actionServiceCallSchema>;
export type ServiceBatchInput = z.infer<typeof serviceBatchSchema>;

const forbiddenDataKeys = new Set([
  'entity_id',
  'target',
  'device_id',
  'area_id',
  'label_id',
  '__proto__',
  'constructor',
  'prototype',
]);

function validateServiceData(value: unknown, depth = 0): string | undefined {
  if (depth > 20) {
    return 'Service data is nested too deeply.';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const error = validateServiceData(item, depth + 1);
      if (error) return error;
    }
    return undefined;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenDataKeys.has(key)) {
        return `Service data field ${key} is not permitted.`;
      }
      const error = validateServiceData(child, depth + 1);
      if (error) return error;
    }
  }

  return undefined;
}

/** Parse and validate either legacy object data or Action-friendly data_json. */
export function resolveServiceData(input: { data?: Record<string, unknown>; data_json?: string }): {
  data?: Record<string, unknown>;
  error?: string;
} {
  let data = input.data;
  if (input.data_json !== undefined) {
    try {
      const parsed: unknown = JSON.parse(input.data_json);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        return { error: 'data_json must contain a JSON object.' };
      }
      data = parsed as Record<string, unknown>;
    } catch {
      return { error: 'data_json must contain valid JSON.' };
    }
  }

  if (data) {
    const error = validateServiceData(data);
    if (error) return { error };
  }

  return { data };
}
