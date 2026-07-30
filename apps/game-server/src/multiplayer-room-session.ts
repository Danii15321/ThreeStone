import {
  createMultiplayerSession,
  recordSessionGame,
  type GameState,
  type MultiplayerSessionState,
  type PlayerId,
} from '@three-stone/game-core';

export interface RematchSnapshot {
  readonly accepted: Readonly<Record<PlayerId, boolean>>;
  readonly deadline: number | null;
}

export type RematchDecision = 'accepted' | 'ready' | 'unavailable';

export class MultiplayerRoomSession {
  private accepted: Record<PlayerId, boolean> = {
    'player-one': false,
    'player-two': false,
  };
  private deadline: number | null = null;
  private readonly reactionTimes = new Map<PlayerId, number[]>();
  private session: MultiplayerSessionState;

  constructor(
    sessionId: string,
    private readonly rematchMs: number,
  ) {
    this.session = createMultiplayerSession(sessionId);
  }

  get score(): Readonly<Record<PlayerId, number>> {
    return this.session.score;
  }

  get rematch(): RematchSnapshot {
    return {
      accepted: { ...this.accepted },
      deadline: this.deadline,
    };
  }

  recordTerminalGame(game: GameState, now: number): void {
    const transition = recordSessionGame(this.session, game);
    if (!transition.ok) {
      throw new Error(`Cannot record a non-terminal game: ${transition.error.code}`);
    }
    this.session = transition.session;
    this.accepted = { 'player-one': false, 'player-two': false };
    this.deadline = game.phase === 'finished' ? now + this.rematchMs : null;
  }

  decideRematch(playerId: PlayerId, accept: boolean, now: number): RematchDecision {
    if (this.deadline === null || this.deadline <= now) {
      return 'unavailable';
    }
    this.accepted[playerId] = accept;
    return this.accepted['player-one'] && this.accepted['player-two'] ? 'ready' : 'accepted';
  }

  beginRematch(): void {
    this.accepted = { 'player-one': false, 'player-two': false };
    this.deadline = null;
    this.reactionTimes.clear();
  }

  rematchExpired(now: number): boolean {
    return this.deadline !== null && this.deadline <= now;
  }

  acceptReaction(playerId: PlayerId, now: number): boolean {
    const recent = (this.reactionTimes.get(playerId) ?? []).filter(
      (timestamp) => timestamp > now - 10_000,
    );
    const last = recent.at(-1);
    if ((last !== undefined && last > now - 2_000) || recent.length >= 3) {
      this.reactionTimes.set(playerId, recent);
      return false;
    }
    recent.push(now);
    this.reactionTimes.set(playerId, recent);
    return true;
  }

  close(): void {
    this.session = createMultiplayerSession(this.session.sessionId);
    this.accepted = { 'player-one': false, 'player-two': false };
    this.deadline = null;
    this.reactionTimes.clear();
  }
}
