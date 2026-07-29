import type { AvatarMediaType } from '../domain/repositories.js';

export const MAX_AVATAR_BYTES = 1024 * 1024;

export interface ValidatedAvatarImage {
  readonly bytes: Uint8Array;
  readonly mediaType: AvatarMediaType;
}

export class AvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarValidationError';
  }
}

export function validateAvatarImage(bytes: Uint8Array, mediaType: string): ValidatedAvatarImage {
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarValidationError('Avatar image is too large.');
  }

  if (!isAvatarMediaType(mediaType)) {
    throw new AvatarValidationError('Unsupported avatar format.');
  }

  const signatureMatches =
    (mediaType === 'image/png' && isPng(bytes)) ||
    (mediaType === 'image/jpeg' && isJpeg(bytes)) ||
    (mediaType === 'image/webp' && isWebp(bytes));
  if (!signatureMatches) {
    throw new AvatarValidationError('Avatar content does not match its declared format.');
  }

  return { bytes, mediaType };
}

function isAvatarMediaType(value: string): value is AvatarMediaType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

function isWebp(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
