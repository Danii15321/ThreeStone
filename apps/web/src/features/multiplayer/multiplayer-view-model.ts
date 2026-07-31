import type { RoomSnapshot, SeatObservation } from '@three-stone/protocol';

import type { BoardPose } from '../../game/board-model.js';

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

export function mapRoundToBoard(round: RoomSnapshot['revealedRounds'][number]) {
  return {
    choices: {
      human: round.choices['player-two'],
      opponent: round.choices['player-one'],
    },
    dropStone:
      round.winner === null
        ? null
        : round.winner === 'player-one'
          ? ('opponent' as const)
          : ('human' as const),
    total: round.total,
  };
}

export function boardPoseForWinner(winner: PlayerId | null): BoardPose {
  if (winner === 'player-one') {
    return 'ai-victory';
  }
  return winner === 'player-two' ? 'human-victory' : 'closed';
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
