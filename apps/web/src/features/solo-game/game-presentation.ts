export type GameSeat = 'ai' | 'human';
export type RoundPresentationStage = 'first-predicted' | 'both-predicted' | 'revealed' | 'resolved';

interface RoundReveal {
  readonly choices: Readonly<Record<GameSeat, number>>;
  readonly predictions: Readonly<Record<GameSeat, number>>;
  readonly total: number;
  readonly winner: GameSeat | null;
}

interface CreateRoundPresentationInput {
  readonly existingPredictions: Readonly<Record<GameSeat, number | null>>;
  readonly initiative: GameSeat;
  readonly reservesAfter: Readonly<Record<GameSeat, number>>;
  readonly reservesBefore: Readonly<Record<GameSeat, number>>;
  readonly reveal: RoundReveal;
  readonly roundNumber: number;
}

export interface RoundPresentation {
  readonly dropStone: GameSeat | null;
  readonly initiative: GameSeat;
  readonly reservesAfter: Readonly<Record<GameSeat, number>>;
  readonly reservesBefore: Readonly<Record<GameSeat, number>>;
  readonly reveal: RoundReveal;
  readonly roundNumber: number;
  readonly stage: RoundPresentationStage;
}

export function createRoundPresentation(input: CreateRoundPresentationInput): RoundPresentation {
  const firstPredictionWasAlreadyVisible = input.existingPredictions[input.initiative] !== null;
  const winner = input.reveal.winner;
  const winnerLostStone =
    winner !== null && input.reservesAfter[winner] < input.reservesBefore[winner];

  return {
    dropStone: winnerLostStone ? winner : null,
    initiative: input.initiative,
    reservesAfter: input.reservesAfter,
    reservesBefore: input.reservesBefore,
    reveal: input.reveal,
    roundNumber: input.roundNumber,
    stage: firstPredictionWasAlreadyVisible ? 'both-predicted' : 'first-predicted',
  };
}

export function advanceRoundPresentation(
  presentation: RoundPresentation,
): RoundPresentation | null {
  const nextStage: Record<RoundPresentationStage, RoundPresentationStage | null> = {
    'first-predicted': 'both-predicted',
    'both-predicted': 'revealed',
    revealed: 'resolved',
    resolved: null,
  };
  const stage = nextStage[presentation.stage];

  return stage === null ? null : { ...presentation, stage };
}

export function getVisiblePredictions(
  presentation: RoundPresentation,
): Readonly<Record<GameSeat, number | null>> {
  if (presentation.stage !== 'first-predicted') {
    return presentation.reveal.predictions;
  }

  return {
    ai: presentation.initiative === 'ai' ? presentation.reveal.predictions.ai : null,
    human: presentation.initiative === 'human' ? presentation.reveal.predictions.human : null,
  };
}
