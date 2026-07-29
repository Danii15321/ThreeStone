import { z } from 'zod';

const graphemeSegmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const reservedNicknames = new Set([
  'admin',
  'administrator',
  'moderator',
  'modérateur',
  'support',
  'system',
  'système',
  'stonegame',
  'ordinateur',
  'computer',
]);

export const nicknameSchema = z
  .string()
  .transform((value) => value.normalize('NFKC').trim().replaceAll(/ {2,}/g, ' '))
  .refine((value) => {
    const length = [...graphemeSegmenter.segment(value)].length;
    return length >= 3 && length <= 24;
  }, 'Nickname must contain between 3 and 24 graphemes.')
  .refine(
    (value) => /^[\p{L}\p{M}\p{N} '’-]+$/u.test(value),
    'Nickname contains a forbidden character.',
  )
  .refine((value) => /\p{L}/u.test(value), 'Nickname must contain at least one letter.')
  .refine(
    (value) => !/^['’-]|['’-]$/u.test(value),
    'Nickname cannot start or end with an apostrophe or hyphen.',
  )
  .refine(
    (value) => !reservedNicknames.has(value.toLocaleLowerCase('fr')),
    'This nickname is reserved.',
  );

export const playerBioSchema = z
  .string()
  .transform((value) => value.replaceAll('\r\n', '\n').trim())
  .refine((value) => value.length <= 280, 'Bio must contain at most 280 characters.')
  .refine(
    (value) => !hasForbiddenControlCharacter(value),
    'Bio contains a forbidden control character.',
  );

export const playerProfileSchema = z.object({
  bio: playerBioSchema,
  createdAt: z.iso.datetime(),
  hasAvatar: z.boolean(),
  nickname: nicknameSchema,
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive(),
});

export const updatePlayerProfileRequestSchema = z
  .object({
    bio: playerBioSchema,
    expectedVersion: z.number().int().nonnegative(),
    nickname: nicknameSchema,
  })
  .strict();

export type PlayerProfile = z.infer<typeof playerProfileSchema>;
export type UpdatePlayerProfileRequest = z.infer<typeof updatePlayerProfileRequestSchema>;

function hasForbiddenControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      (codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) ||
      codePoint === 127
    );
  });
}
