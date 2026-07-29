import { z } from 'zod';

import { playerPreferencesSchema } from './preferences.js';
import { playerProfileSchema } from './profile.js';
import { soloGameResultSchema, soloStatsSchema } from './results.js';

export const accountMetadataSchema = z.object({
  createdAt: z.iso.datetime(),
  displayUsername: z.string().min(3).max(24),
  id: z.string().min(1),
  image: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  username: z.string().min(3).max(24),
});

export const accountExportSchema = z.object({
  account: accountMetadataSchema,
  exportedAt: z.iso.datetime(),
  preferences: playerPreferencesSchema,
  profile: playerProfileSchema.nullable(),
  results: z.array(soloGameResultSchema),
  schemaVersion: z.literal('1.0.0'),
  stats: soloStatsSchema,
});

export type AccountMetadata = z.infer<typeof accountMetadataSchema>;
export type AccountExport = z.infer<typeof accountExportSchema>;
