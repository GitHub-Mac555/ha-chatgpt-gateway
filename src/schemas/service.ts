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

export const serviceCallSchema = z
  .object({
    domain: homeAssistantName.transform((value) => value.toLowerCase()),
    service: homeAssistantName.transform((value) => value.toLowerCase()),
    entity_id: entityIdsSchema.optional(),
    target: targetSchema.optional(),
    data: dataSchema.optional().default({}),
  })
  .strict()
  .superRefine((value, context) => {
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
