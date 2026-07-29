import { describe, expect, it } from 'vitest';

import { validateAvatarImage } from './avatar-image.js';

describe('avatar image validation', () => {
  it.each([
    ['image/png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    ['image/jpeg', Uint8Array.from([255, 216, 255, 224, 0])],
    ['image/webp', Uint8Array.from([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 0])],
  ])('accepts a bounded %s avatar with a matching signature', (mediaType, bytes) => {
    expect(validateAvatarImage(bytes, mediaType)).toEqual({ bytes, mediaType });
  });

  it('rejects unsupported, disguised and oversized files', () => {
    expect(() =>
      validateAvatarImage(Uint8Array.from([60, 115, 118, 103]), 'image/svg+xml'),
    ).toThrow('Unsupported avatar format');
    expect(() =>
      validateAvatarImage(Uint8Array.from([60, 104, 116, 109, 108]), 'image/png'),
    ).toThrow('does not match');
    expect(() => validateAvatarImage(new Uint8Array(1_048_577), 'image/jpeg')).toThrow('too large');
  });
});
