import { z } from 'zod';

export const motionPreferenceSchema = z.enum(['system', 'reduce', 'no-preference']);
export const gameDifficultySchema = z.enum(['easy', 'standard', 'hard']);

export const playerPreferencesSchema = z.object({
  difficulty: gameDifficultySchema,
  highContrast: z.boolean(),
  motion: motionPreferenceSchema,
  muted: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  tutorialCompleted: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const updatePlayerPreferencesRequestSchema = playerPreferencesSchema
  .omit({ updatedAt: true })
  .strict();

export type GameDifficulty = z.infer<typeof gameDifficultySchema>;
export type PlayerPreferences = z.infer<typeof playerPreferencesSchema>;
export type UpdatePlayerPreferencesRequest = z.infer<typeof updatePlayerPreferencesRequestSchema>;
