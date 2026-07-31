import { createHash } from 'node:crypto';

import { calculateStonesExchange, INITIAL_STONES } from '@three-stone/game-core';
import { and, asc, eq, gt, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '../client/create-database.js';
import {
  activeMultiplayerLease,
  multiplayerGame,
  multiplayerParticipant,
  multiplayerRound,
  playerStones,
} from '../schema/index.js';

export type MultiplayerSeat = 'player-one' | 'player-two';
export type PersistedTerminalReason =
  'reserve-empty' | 'hidden-choice-timeout' | 'prediction-timeout' | 'abandon' | 'disconnect';

export interface AcquireMultiplayerLeaseInput {
  readonly expiresAt: Date;
  readonly leaseTokenHash: string;
  readonly now: Date;
  readonly roomId: string;
  readonly serverInstanceId: string;
  readonly userId: string;
}

export interface RenewMultiplayerLeaseInput {
  readonly expiresAt: Date;
  readonly leaseTokenHash: string;
  readonly now: Date;
  readonly roomId: string;
  readonly userId: string;
}

export interface ActiveMultiplayerLease {
  readonly expiresAt: Date;
  readonly heartbeatAt: Date;
  readonly roomId: string;
  readonly serverInstanceId: string;
  readonly userId: string;
}

export type AcquireMultiplayerLeaseOutcome = 'acquired' | 'existing' | 'conflict';

export class DrizzleMultiplayerLeaseRepository {
  constructor(private readonly database: Database) {}

  async acquire(input: AcquireMultiplayerLeaseInput): Promise<AcquireMultiplayerLeaseOutcome> {
    assertFutureExpiry(input.now, input.expiresAt);
    const [acquired] = await this.database
      .insert(activeMultiplayerLease)
      .values({
        expiresAt: input.expiresAt,
        heartbeatAt: input.now,
        leaseTokenHash: input.leaseTokenHash,
        roomId: input.roomId,
        serverInstanceId: input.serverInstanceId,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: activeMultiplayerLease.userId,
        set: {
          expiresAt: input.expiresAt,
          heartbeatAt: input.now,
          leaseTokenHash: input.leaseTokenHash,
          roomId: input.roomId,
          serverInstanceId: input.serverInstanceId,
        },
        setWhere: lte(activeMultiplayerLease.expiresAt, input.now),
      })
      .returning({ roomId: activeMultiplayerLease.roomId });

    if (acquired !== undefined) {
      return 'acquired';
    }
    const existing = await this.findActive(input.userId, input.now);
    return existing?.roomId === input.roomId ? 'existing' : 'conflict';
  }

  async findActive(userId: string, now: Date): Promise<ActiveMultiplayerLease | null> {
    const [lease] = await this.database
      .select({
        expiresAt: activeMultiplayerLease.expiresAt,
        heartbeatAt: activeMultiplayerLease.heartbeatAt,
        roomId: activeMultiplayerLease.roomId,
        serverInstanceId: activeMultiplayerLease.serverInstanceId,
        userId: activeMultiplayerLease.userId,
      })
      .from(activeMultiplayerLease)
      .where(
        and(eq(activeMultiplayerLease.userId, userId), gt(activeMultiplayerLease.expiresAt, now)),
      )
      .limit(1);
    return lease ?? null;
  }

  async renew(input: RenewMultiplayerLeaseInput): Promise<boolean> {
    assertFutureExpiry(input.now, input.expiresAt);
    const [renewed] = await this.database
      .update(activeMultiplayerLease)
      .set({
        expiresAt: input.expiresAt,
        heartbeatAt: input.now,
      })
      .where(
        and(
          eq(activeMultiplayerLease.userId, input.userId),
          eq(activeMultiplayerLease.roomId, input.roomId),
          eq(activeMultiplayerLease.leaseTokenHash, input.leaseTokenHash),
          gt(activeMultiplayerLease.expiresAt, input.now),
        ),
      )
      .returning({ userId: activeMultiplayerLease.userId });
    return renewed !== undefined;
  }

  async release(userId: string, roomId: string, leaseTokenHash: string): Promise<boolean> {
    const [released] = await this.database
      .delete(activeMultiplayerLease)
      .where(
        and(
          eq(activeMultiplayerLease.userId, userId),
          eq(activeMultiplayerLease.roomId, roomId),
          eq(activeMultiplayerLease.leaseTokenHash, leaseTokenHash),
        ),
      )
      .returning({ userId: activeMultiplayerLease.userId });
    return released !== undefined;
  }
}

export interface MultiplayerParticipantInput {
  readonly finalReserve: number;
  readonly outcome: 'win' | 'loss';
  readonly seat: MultiplayerSeat;
  readonly userId: string;
}

export interface MultiplayerRoundInput {
  readonly choices: Readonly<Record<MultiplayerSeat, number>>;
  readonly initiative: MultiplayerSeat;
  readonly predictions: Readonly<Record<MultiplayerSeat, number>>;
  readonly reservesAfter: Readonly<Record<MultiplayerSeat, number>>;
  readonly roundNumber: number;
  readonly total: number;
  readonly winner: MultiplayerSeat | null;
}

export interface SaveMultiplayerGameInput {
  readonly completedAt: Date;
  readonly gameId: string;
  readonly initialInitiative: MultiplayerSeat;
  readonly participants: readonly [MultiplayerParticipantInput, MultiplayerParticipantInput];
  readonly protocolVersion: number;
  readonly rounds: readonly MultiplayerRoundInput[];
  readonly rulesVersion: string;
  readonly seed: number;
  readonly terminalReason: PersistedTerminalReason;
  readonly winner: MultiplayerSeat;
}

export type SaveMultiplayerGameOutcome =
  | { readonly kind: 'contradiction' }
  | { readonly kind: 'created' | 'existing'; readonly gameId: string };

export class DrizzleMultiplayerResultRepository {
  constructor(private readonly database: Database) {}

  async save(
    input: SaveMultiplayerGameInput,
    recordedAt: Date,
  ): Promise<SaveMultiplayerGameOutcome> {
    const fingerprint = resultFingerprint(input);
    return this.database.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(multiplayerGame)
        .values({
          completedAt: input.completedAt,
          fingerprint,
          gameId: input.gameId,
          initialInitiative: input.initialInitiative,
          protocolVersion: input.protocolVersion,
          recordedAt,
          roundsPlayed: input.rounds.length,
          rulesVersion: input.rulesVersion,
          seed: input.seed,
          terminalReason: input.terminalReason,
          winner: input.winner,
        })
        .onConflictDoNothing({ target: multiplayerGame.gameId })
        .returning({ gameId: multiplayerGame.gameId });

      if (inserted !== undefined) {
        const userIds = input.participants.map((participant) => participant.userId);
        await transaction
          .insert(playerStones)
          .values(
            userIds.map((userId) => ({
              ratedGames: 0,
              stones: INITIAL_STONES,
              updatedAt: recordedAt,
              userId,
            })),
          )
          .onConflictDoNothing({ target: playerStones.userId });
        const lockedStones = await transaction
          .select({
            stones: playerStones.stones,
            userId: playerStones.userId,
          })
          .from(playerStones)
          .where(inArray(playerStones.userId, userIds))
          .orderBy(asc(playerStones.userId))
          .for('update');
        const winner = input.participants.find((participant) => participant.outcome === 'win');
        const loser = input.participants.find((participant) => participant.outcome === 'loss');
        if (winner === undefined || loser === undefined || lockedStones.length !== 2) {
          throw new Error('A rated multiplayer result requires exactly one winner and one loser.');
        }
        const winnerBefore = stonesFor(lockedStones, winner.userId);
        const loserBefore = stonesFor(lockedStones, loser.userId);
        const exchange = calculateStonesExchange({
          loserStones: loserBefore,
          roundsPlayed: Math.max(1, input.rounds.length),
          winnerStones: winnerBefore,
        });
        const ratingByUserId = new Map([
          [
            winner.userId,
            { after: exchange.winnerAfter, before: winnerBefore, delta: exchange.delta },
          ],
          [
            loser.userId,
            { after: exchange.loserAfter, before: loserBefore, delta: -exchange.delta },
          ],
        ]);

        await transaction.insert(multiplayerParticipant).values(
          input.participants.map((participant) => {
            const rating = ratingByUserId.get(participant.userId);
            if (rating === undefined) {
              throw new Error('Missing participant Stones exchange.');
            }
            return {
              finalReserve: participant.finalReserve,
              gameId: input.gameId,
              outcome: participant.outcome,
              stonesAfter: rating.after,
              stonesBefore: rating.before,
              stonesDelta: rating.delta,
              seat: participant.seat,
              userId: participant.userId,
            };
          }),
        );
        for (const [userId, rating] of ratingByUserId) {
          await transaction
            .update(playerStones)
            .set({
              ratedGames: sql`${playerStones.ratedGames} + 1`,
              stones: rating.after,
              updatedAt: recordedAt,
            })
            .where(eq(playerStones.userId, userId));
        }
        if (input.rounds.length > 0) {
          await transaction.insert(multiplayerRound).values(
            input.rounds.map((round) => ({
              choiceOne: round.choices['player-one'],
              choiceTwo: round.choices['player-two'],
              gameId: input.gameId,
              initiative: round.initiative,
              predictionOne: round.predictions['player-one'],
              predictionTwo: round.predictions['player-two'],
              reserveOneAfter: round.reservesAfter['player-one'],
              reserveTwoAfter: round.reservesAfter['player-two'],
              roundNumber: round.roundNumber,
              total: round.total,
              winner: round.winner,
            })),
          );
        }
        return { kind: 'created', gameId: input.gameId };
      }

      const [existing] = await transaction
        .select({
          fingerprint: multiplayerGame.fingerprint,
        })
        .from(multiplayerGame)
        .where(eq(multiplayerGame.gameId, input.gameId))
        .limit(1);
      if (existing?.fingerprint !== fingerprint) {
        return { kind: 'contradiction' };
      }
      return { kind: 'existing', gameId: input.gameId };
    });
  }
}

function stonesFor(
  ratings: readonly { readonly stones: number; readonly userId: string }[],
  userId: string,
): number {
  const rating = ratings.find((candidate) => candidate.userId === userId);
  if (rating === undefined) {
    throw new Error('Missing locked player Stones.');
  }
  return rating.stones;
}

function assertFutureExpiry(now: Date, expiresAt: Date): void {
  if (expiresAt.getTime() <= now.getTime()) {
    throw new RangeError('A multiplayer lease expiry must be in the future.');
  }
}

function resultFingerprint(input: SaveMultiplayerGameInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ...input,
        completedAt: input.completedAt.toISOString(),
      }),
    )
    .digest('hex');
}
