import { z } from 'zod';

export const entityParamsSchema = z.object({
  entityId: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i, 'Invalid Home Assistant entity_id')
    .transform((value) => value.toLowerCase()),
});
