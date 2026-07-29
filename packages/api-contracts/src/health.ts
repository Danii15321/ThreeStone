import { z } from 'zod';

export const healthResponseSchema = z.object({
  service: z.literal('api'),
  status: z.literal('ok'),
});

export const readinessResponseSchema = z.object({
  checks: z.object({
    database: z.enum(['ok', 'unavailable']),
  }),
  service: z.literal('api'),
  status: z.enum(['ready', 'unavailable']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
