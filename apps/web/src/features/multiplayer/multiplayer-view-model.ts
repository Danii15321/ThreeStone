import type { RoomSnapshot, SeatObservation } from '@three-stone/protocol';

type PlayerId = 'player-one' | 'player-two';

export interface MultiplayerControls {
  readonly hiddenChoices: readonly number[];
  readonly predictions: readonly number[];
}

export function deriveMultiplayerControls(
  snapshot: RoomSnapshot,
  observation: SeatObservation | null,
  localPlayerId: PlayerId,
): MultiplayerControls {
  if (!snapshot.ready['player-one'] || !snapshot.ready['player-two']) {
    return { hiddenChoices: [], predictions: [] };
  }
  const ownChoiceSubmitted =
    observation?.playerId === localPlayerId && observation.ownHiddenChoice !== undefined;
  const hiddenChoices =
    snapshot.phase === 'hidden-choices' && !ownChoiceSubmitted
      ? range(snapshot.reserves[localPlayerId])
      : [];
  const localPrediction = snapshot.predictions[localPlayerId];
  const canPredictFirst =
    snapshot.phase === 'first-prediction' && snapshot.initiative === localPlayerId;
  const canPredictSecond =
    snapshot.phase === 'second-prediction' && snapshot.initiative !== localPlayerId;
  if (localPrediction !== undefined || (!canPredictFirst && !canPredictSecond)) {
    return { hiddenChoices, predictions: [] };
  }

  const opponentId = otherPlayer(localPlayerId);
  const forbidden = snapshot.predictions[opponentId];
  return {
    hiddenChoices,
    predictions: range(6).filter((value) => value !== forbidden),
  };
}

export function mapRoundToLocalBoard(
  round: RoomSnapshot['revealedRounds'][number],
  localPlayerId: PlayerId,
) {
  const opponentId = otherPlayer(localPlayerId);
  return {
    choices: {
      human: round.choices[localPlayerId],
      opponent: round.choices[opponentId],
    },
    dropStone:
      round.winner === null
        ? null
        : round.winner === localPlayerId
          ? ('human' as const)
          : ('opponent' as const),
    total: round.total,
  };
}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'player-one' ? 'player-two' : 'player-one';
}

export function stoneReserveLabel(reserve: number): string {
  return `${reserve} caillou${reserve > 1 ? 'x' : ''} restant${reserve > 1 ? 's' : ''}`;
}

function range(maximum: number): number[] {
  return Array.from({ length: maximum + 1 }, (_, value) => value);
}
