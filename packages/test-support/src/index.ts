import fc, { type Arbitrary } from 'fast-check';

export interface GeneratedGameSequence {
  readonly seed: number;
  readonly sequenceNumber: number;
  readonly legalActionSelectors: readonly number[];
}

export function generatedGameSequenceArbitrary(
  maximumActions = 250,
): Arbitrary<GeneratedGameSequence> {
  return fc.record({
    seed: fc.integer(),
    sequenceNumber: fc.integer({ min: 1, max: 10_000 }),
    legalActionSelectors: fc.array(fc.nat(), {
      minLength: 1,
      maxLength: maximumActions,
    }),
  });
}
