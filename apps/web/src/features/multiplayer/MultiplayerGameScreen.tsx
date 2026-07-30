import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type {
  CreateMultiplayerRoomResponse,
  JoinMultiplayerRoomResponse,
} from '@three-stone/api-contracts';
import type { RoomSnapshot } from '@three-stone/protocol';

import { createBoardModel } from '../../game/board-model.js';
import { PhaserBoard } from '../../game/PhaserBoard.js';
import type { UserPreferences } from '../settings/preferences.js';
import gameStyles from '../solo-game/GameScreen.module.css';
import { normalizePredictionValue } from '../solo-game/game-controls.js';
import { MultiplayerClient, projectLocalSeats } from './multiplayer-client.js';
import { PlayerCard, PredictionSlider, StonePicker, WaitingRoom } from './MultiplayerGameParts.js';
import {
  deriveMultiplayerControls,
  mapRoundToLocalBoard,
  otherPlayer,
} from './multiplayer-view-model.js';
import {
  networkErrorMessage,
  shouldReduceMotion,
  statusMessage,
} from './multiplayer-presentation.js';

type Admission = CreateMultiplayerRoomResponse | JoinMultiplayerRoomResponse;

interface MultiplayerGameScreenProps {
  readonly admission: Admission;
  readonly onExit: () => void;
  readonly preferences: UserPreferences;
}

export function MultiplayerGameScreen({
  admission,
  onExit,
  preferences,
}: MultiplayerGameScreenProps) {
  const client = useMemo(() => new MultiplayerClient(admission), [admission]);
  const network = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const [selectedStones, setSelectedStones] = useState<ReadonlySet<number>>(() => new Set());
  const [predictionValue, setPredictionValue] = useState(0);
  const [revealedRound, setRevealedRound] = useState<RoomSnapshot['revealedRounds'][number] | null>(
    null,
  );
  const shownRoundNumber = useRef(0);
  const readySent = useRef(false);
  const reducedMotion = shouldReduceMotion(preferences);
  const snapshot = network.snapshot;

  useEffect(() => {
    void client.connect().catch(() => undefined);
    return () => {
      void client.close();
    };
  }, [client]);

  useEffect(() => {
    if (snapshot === null || snapshot.ready[admission.playerId] || readySent.current) {
      return;
    }
    readySent.current = true;
    try {
      client.send('room.ready', { ready: true });
    } catch {
      readySent.current = false;
    }
  }, [admission.playerId, client, snapshot]);

  useEffect(() => {
    const latest = snapshot?.revealedRounds.at(-1);
    if (latest === undefined || latest.roundNumber <= shownRoundNumber.current) {
      return;
    }
    shownRoundNumber.current = latest.roundNumber;
    setRevealedRound(latest);
    const timeout = window.setTimeout(() => setRevealedRound(null), reducedMotion ? 250 : 1_900);
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, snapshot?.revealedRounds]);

  if (snapshot === null) {
    return (
      <WaitingRoom
        connection={network.connection}
        error={network.error}
        inviteCode={'inviteCode' in admission ? admission.inviteCode : null}
        onExit={onExit}
      />
    );
  }

  const localPlayerId = admission.playerId;
  const opponentPlayerId = otherPlayer(localPlayerId);
  const seats = projectLocalSeats(network);
  const controls = deriveMultiplayerControls(snapshot, network.observation, localPlayerId);
  const activePrediction = controls.predictions.includes(predictionValue)
    ? predictionValue
    : (controls.predictions[0] ?? 0);
  const firstPrediction = snapshot.predictions[opponentPlayerId];
  const boardRound = revealedRound ? mapRoundToLocalBoard(revealedRound, localPlayerId) : null;
  const winner = snapshot.winner;
  const boardPose =
    boardRound !== null
      ? 'revealed'
      : snapshot.phase === 'finished'
        ? winner === localPlayerId
          ? 'human-victory'
          : 'ai-victory'
        : 'closed';
  const boardModel = createBoardModel({
    dropStone:
      boardRound?.dropStone === 'opponent'
        ? 'ai'
        : boardRound?.dropStone === 'human'
          ? 'human'
          : null,
    pose: boardPose,
    reserves: {
      ai: snapshot.reserves[opponentPlayerId],
      human: snapshot.reserves[localPlayerId],
    },
    reveal:
      boardRound === null
        ? null
        : {
            choices: {
              ai: boardRound.choices.opponent,
              human: boardRound.choices.human,
            },
          },
  });

  function toggleStone(index: number): void {
    setSelectedStones((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function submitChoice(): void {
    if (!controls.hiddenChoices.includes(selectedStones.size)) {
      return;
    }
    client.send('round.choose', { count: selectedStones.size });
    setSelectedStones(new Set());
  }

  function changePrediction(nextValue: number): number {
    const normalized = normalizePredictionValue(nextValue, activePrediction, controls.predictions);
    setPredictionValue(normalized);
    return normalized;
  }

  function exitGame(): void {
    const currentPhase = client.getState().snapshot?.phase;
    if (currentPhase !== undefined && currentPhase !== 'finished' && currentPhase !== 'cancelled') {
      client.send('match.abandon', {});
    }
    window.setTimeout(onExit, reducedMotion ? 0 : 160);
  }

  return (
    <main className={gameStyles.game} data-high-contrast={preferences.highContrast}>
      <header className={gameStyles.topbar}>
        <div>
          <p className={gameStyles.eyebrow}>Duel privé · manche {snapshot.roundNumber}</p>
          <h1>ThreeStone</h1>
        </div>
        <button className={gameStyles.secondaryButton} type="button" onClick={exitGame}>
          Quitter la partie
        </button>
      </header>

      <section className={gameStyles.arena} aria-label="Table multijoueur">
        <PhaserBoard
          highContrast={preferences.highContrast}
          model={boardModel}
          opponentName={seats?.left.username ?? 'Adversaire'}
          playerName={seats?.right.username ?? 'Joueur'}
          reducedMotion={reducedMotion}
        />
        <div className={gameStyles.profiles}>
          <PlayerCard
            avatarUrl={seats?.left.avatarUrl}
            connected={seats?.left.connected ?? false}
            initiative={snapshot.initiative === opponentPlayerId}
            name={seats?.left.username ?? 'Adversaire'}
            prediction={
              revealedRound?.predictions[opponentPlayerId] ??
              snapshot.predictions[opponentPlayerId] ??
              null
            }
            reserve={snapshot.reserves[opponentPlayerId]}
            side="left"
            winner={winner === opponentPlayerId}
          />
          <PlayerCard
            avatarUrl={seats?.right.avatarUrl}
            connected={seats?.right.connected ?? false}
            initiative={snapshot.initiative === localPlayerId}
            name={seats?.right.username ?? 'Joueur'}
            prediction={
              revealedRound?.predictions[localPlayerId] ??
              snapshot.predictions[localPlayerId] ??
              null
            }
            reserve={snapshot.reserves[localPlayerId]}
            side="right"
            winner={winner === localPlayerId}
          />
        </div>
      </section>

      <section className={gameStyles.status} aria-live="polite" aria-atomic="true">
        <span className={gameStyles.statusRune} aria-hidden="true">
          ◆
        </span>
        <div>
          <p className={gameStyles.statusTitle}>
            {statusMessage(snapshot, network.observation?.ownHiddenChoice, localPlayerId)}
          </p>
          {boardRound ? (
            <p className={gameStyles.reveal}>
              {boardRound.choices.opponent} + {boardRound.choices.human} ={' '}
              <strong>{boardRound.total}</strong>
            </p>
          ) : null}
          {network.error ? (
            <p className={gameStyles.error}>{networkErrorMessage(network.error)}</p>
          ) : null}
        </div>
      </section>

      {controls.hiddenChoices.length > 0 ? (
        <StonePicker
          onConfirm={submitChoice}
          onToggle={toggleStone}
          reserve={snapshot.reserves[localPlayerId]}
          selected={selectedStones}
        />
      ) : null}

      {controls.predictions.length > 0 ? (
        <PredictionSlider
          forbiddenValue={firstPrediction ?? null}
          onChange={changePrediction}
          onConfirm={() => client.send('round.predict', { value: activePrediction })}
          value={activePrediction}
        />
      ) : null}

      {snapshot.phase === 'finished' || snapshot.phase === 'cancelled' ? (
        <section className={gameStyles.result} aria-labelledby="multiplayer-result-title">
          <p className={gameStyles.eyebrow}>Partie terminée</p>
          <h2 id="multiplayer-result-title">
            {snapshot.phase === 'cancelled'
              ? 'Partie annulée'
              : winner === localPlayerId
                ? 'Victoire !'
                : `${seats?.left.username ?? 'Votre adversaire'} remporte la partie`}
          </h2>
          <p>
            {snapshot.phase === 'cancelled'
              ? 'Aucun résultat ni gagnant ne sera enregistré.'
              : `Le duel s’est joué en ${snapshot.roundNumber} manches.`}
          </p>
          <div className={gameStyles.resultActions}>
            <button className={gameStyles.secondaryButton} type="button" onClick={onExit}>
              Retour à l’accueil
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
