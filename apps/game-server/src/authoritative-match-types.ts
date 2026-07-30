import type { PlayerId } from '@three-stone/game-core';

import type { TerminalResultRepository } from './terminal-result-repository.js';
import type { GameServerDrainController } from './game-server-drain-controller.js';
import type { GameServerMetrics } from './game-server-metrics.js';

export interface MatchClock {
  now(): number;
}

export interface AdmissionIdentity {
  readonly avatarUrl: string | null;
  readonly connectionGeneration: number;
  readonly playerId: PlayerId;
  readonly roomId: string;
  readonly userId: string;
  readonly username: string;
}

export interface MatchConnection {
  readonly connectionId: string;
  close?(): void;
  send(type: string, payload: unknown): void;
}

export interface MatchDeadlines {
  readonly disconnectBudgetMs: number;
  readonly disconnectGraceMs: number;
  readonly hiddenChoiceMs: number;
  readonly predictionMs: number;
  readonly rematchMs: number;
  readonly resumeTokenLifetimeMs: number;
}

export interface MatchDependencies {
  readonly clock: MatchClock;
  readonly createGameId?: () => string;
  readonly createGameSeed?: () => number;
  readonly createResumeToken?: () => string;
  readonly deadlines?: Partial<MatchDeadlines>;
  readonly drainController?: GameServerDrainController;
  readonly leaseHeartbeat?: {
    readonly intervalMs: number;
    check(roomId: string): Promise<'healthy' | 'lost' | 'unavailable'>;
  };
  readonly resultRepository: TerminalResultRepository;
  readonly metrics?: GameServerMetrics;
  readonly schedule?: (delayMs: number, task: () => void) => () => void;
  readonly verifyAdmissionTicket: (
    ticket: string,
    expectedRoomId: string,
  ) => Promise<AdmissionIdentity | null>;
}

export interface MatchOptions {
  readonly gameId: string;
  readonly roomId: string;
  readonly seed: number;
}

export type MatchJoinResult =
  | { readonly ok: true; readonly identity: AdmissionIdentity }
  | { readonly ok: false; readonly code: 'ROOM_UNAVAILABLE' };
