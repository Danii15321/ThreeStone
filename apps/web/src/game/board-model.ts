export type BoardPose = 'ai-victory' | 'closed' | 'human-victory' | 'revealed';

export interface BoardInput {
  readonly dropStone: 'ai' | 'human' | null;
  readonly pose: BoardPose;
  readonly reveal: {
    readonly choices: Readonly<{ ai: number; human: number }>;
  } | null;
  readonly reserves: Readonly<{ ai: number; human: number }>;
}

export interface BoardModel {
  readonly pose: BoardPose;
  readonly ai: {
    readonly revealedCount: number;
    readonly reserve: number;
  };
  readonly human: {
    readonly revealedCount: number;
    readonly reserve: number;
  };
  readonly dropStone: 'ai' | 'human' | null;
}

export function createBoardModel(input: BoardInput): BoardModel {
  return {
    pose: input.pose,
    ai: {
      revealedCount: input.pose === 'revealed' ? (input.reveal?.choices.ai ?? 0) : 0,
      reserve: input.reserves.ai,
    },
    human: {
      revealedCount: input.pose === 'revealed' ? (input.reveal?.choices.human ?? 0) : 0,
      reserve: input.reserves.human,
    },
    dropStone: input.dropStone,
  };
}
