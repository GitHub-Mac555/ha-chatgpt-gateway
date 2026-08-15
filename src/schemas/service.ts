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

export const serviceCallSchema = z.object({
  domain: homeAssistantName.transform((value) => value.toLowerCase()),
  service: homeAssistantName.transform((value) => value.toLowerCase()),
  entity_id: z.union([entityIdSchema, z.array(entityIdSchema).min(1).max(50)]),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export type ServiceCallInput = z.infer<typeof serviceCallSchema>;
