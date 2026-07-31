import {
  multiplayerGameHistorySchema,
  multiplayerStatsSchema,
  type MultiplayerGameHistory,
  type MultiplayerGameHistoryQuery,
  type MultiplayerStats,
} from '@three-stone/api-contracts';
import { INITIAL_STONES } from '@three-stone/game-core';
import type { Database } from '@three-stone/database';
import { schema } from '@three-stone/database';
import { count, desc, eq, inArray } from 'drizzle-orm';

export class DrizzleMultiplayerHistoryRepository {
  constructor(private readonly database: Database) {}

  async list(userId: string, query: MultiplayerGameHistoryQuery): Promise<MultiplayerGameHistory> {
    const [games, totalRows] = await Promise.all([
      this.database
        .select({
          completedAt: schema.multiplayerGame.completedAt,
          gameId: schema.multiplayerGame.gameId,
          initialInitiative: schema.multiplayerGame.initialInitiative,
          localSeat: schema.multiplayerParticipant.seat,
          protocolVersion: schema.multiplayerGame.protocolVersion,
          rulesVersion: schema.multiplayerGame.rulesVersion,
          seed: schema.multiplayerGame.seed,
          terminalReason: schema.multiplayerGame.terminalReason,
          winner: schema.multiplayerGame.winner,
        })
        .from(schema.multiplayerParticipant)
        .innerJoin(
          schema.multiplayerGame,
          eq(schema.multiplayerParticipant.gameId, schema.multiplayerGame.gameId),
        )
        .where(eq(schema.multiplayerParticipant.userId, userId))
        .orderBy(desc(schema.multiplayerGame.completedAt), desc(schema.multiplayerGame.gameId))
        .limit(query.limit)
        .offset(query.offset),
      this.database
        .select({ value: count() })
        .from(schema.multiplayerParticipant)
        .where(eq(schema.multiplayerParticipant.userId, userId)),
    ]);

    if (games.length === 0) {
      return multiplayerGameHistorySchema.parse({
        items: [],
        limit: query.limit,
        offset: query.offset,
        total: totalRows[0]?.value ?? 0,
      });
    }

    const gameIds = games.map((game) => game.gameId);
    const [participants, rounds] = await Promise.all([
      this.database
        .select({
          displayUsername: schema.user.displayUsername,
          finalReserve: schema.multiplayerParticipant.finalReserve,
          gameId: schema.multiplayerParticipant.gameId,
          name: schema.user.name,
          outcome: schema.multiplayerParticipant.outcome,
          stonesAfter: schema.multiplayerParticipant.stonesAfter,
          stonesBefore: schema.multiplayerParticipant.stonesBefore,
          stonesDelta: schema.multiplayerParticipant.stonesDelta,
          seat: schema.multiplayerParticipant.seat,
          userId: schema.multiplayerParticipant.userId,
        })
        .from(schema.multiplayerParticipant)
        .leftJoin(schema.user, eq(schema.multiplayerParticipant.userId, schema.user.id))
        .where(inArray(schema.multiplayerParticipant.gameId, gameIds)),
      this.database
        .select()
        .from(schema.multiplayerRound)
        .where(inArray(schema.multiplayerRound.gameId, gameIds))
        .orderBy(schema.multiplayerRound.gameId, schema.multiplayerRound.roundNumber),
    ]);

    return multiplayerGameHistorySchema.parse({
      items: games.map((game) => ({
        ...game,
        completedAt: game.completedAt.toISOString(),
        participants: Object.fromEntries(
          participants
            .filter((participant) => participant.gameId === game.gameId)
            .map((participant) => [
              participant.seat,
              participant.userId === null || participant.name === null
                ? {
                    deleted: true,
                    displayName: 'Joueur supprimé',
                    finalReserve: participant.finalReserve,
                    outcome: participant.outcome,
                    stonesAfter: participant.stonesAfter,
                    stonesBefore: participant.stonesBefore,
                    stonesDelta: participant.stonesDelta,
                  }
                : {
                    deleted: false,
                    displayName: participant.displayUsername ?? participant.name,
                    finalReserve: participant.finalReserve,
                    outcome: participant.outcome,
                    stonesAfter: participant.stonesAfter,
                    stonesBefore: participant.stonesBefore,
                    stonesDelta: participant.stonesDelta,
                  },
            ]),
        ),
        rounds: rounds
          .filter((round) => round.gameId === game.gameId)
          .map((round) => ({
            choices: {
              'player-one': round.choiceOne,
              'player-two': round.choiceTwo,
            },
            initiative: round.initiative,
            predictions: {
              'player-one': round.predictionOne,
              'player-two': round.predictionTwo,
            },
            reservesAfter: {
              'player-one': round.reserveOneAfter,
              'player-two': round.reserveTwoAfter,
            },
            roundNumber: round.roundNumber,
            total: round.total,
            winner: round.winner,
          })),
      })),
      limit: query.limit,
      offset: query.offset,
      total: totalRows[0]?.value ?? 0,
    });
  }

  async stats(userId: string): Promise<MultiplayerStats> {
    const [gamesRows, stonesRows] = await Promise.all([
      this.database
        .select({ value: count() })
        .from(schema.multiplayerParticipant)
        .where(eq(schema.multiplayerParticipant.userId, userId)),
      this.database
        .select({ stones: schema.playerStones.stones })
        .from(schema.playerStones)
        .where(eq(schema.playerStones.userId, userId))
        .limit(1),
    ]);
    return multiplayerStatsSchema.parse({
      gamesPlayed: gamesRows[0]?.value ?? 0,
      stones: stonesRows[0]?.stones ?? INITIAL_STONES,
    });
  }
}
