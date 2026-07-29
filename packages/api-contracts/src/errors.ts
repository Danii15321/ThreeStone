import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'CONFLICT',
  'FORBIDDEN',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'VALIDATION_ERROR',
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    details: z.record(z.string(), z.array(z.string())).optional(),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
