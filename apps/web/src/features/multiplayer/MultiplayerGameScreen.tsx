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
import { MultiplayerClient, projectBoardSeats } from './multiplayer-client.js';
import { PlayerCard, PredictionSlider, StonePicker, WaitingRoom } from './MultiplayerGameParts.js';
import {
  boardPoseForWinner,
  deriveMultiplayerControls,
  mapRoundToBoard,
  otherPlayer,
} from './multiplayer-view-model.js';
import {
  networkErrorMessage,
  reactionLabel,
  rematchPresentation,
  remainingSeconds,
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
  const previousPhase = useRef<RoomSnapshot['phase'] | null>(null);
  const readySent = useRef(false);
  const reducedMotion = shouldReduceMotion(preferences);
  const snapshot = network.snapshot;
  const actionSeconds = useServerCountdown(
    snapshot?.actionDeadline ?? null,
    snapshot?.serverNow ?? 0,
    snapshot?.sequence ?? 0,
  );
  const rematchSeconds = useServerCountdown(
    snapshot?.rematch.deadline ?? null,
    snapshot?.serverNow ?? 0,
    snapshot?.sequence ?? 0,
  );

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
    if (
      previousPhase.current === 'finished' &&
      snapshot?.phase === 'hidden-choices' &&
      snapshot.roundNumber === 1 &&
      snapshot.revealedRounds.length === 0
    ) {
      shownRoundNumber.current = 0;
      setRevealedRound(null);
    }
    previousPhase.current = snapshot?.phase ?? null;
  }, [snapshot]);

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
  const seats = projectBoardSeats(network);
  const controls = deriveMultiplayerControls(snapshot, network.observation, localPlayerId);
  const activePrediction = controls.predictions.includes(predictionValue)
    ? predictionValue
    : (controls.predictions[0] ?? 0);
  const firstPrediction = snapshot.predictions[opponentPlayerId];
  const boardRound = revealedRound ? mapRoundToBoard(revealedRound) : null;
  const winner = snapshot.winner;
  const rematch = rematchPresentation(snapshot, localPlayerId);
  const boardPose =
    boardRound !== null
      ? 'revealed'
      : snapshot.phase === 'finished'
        ? boardPoseForWinner(winner)
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
      ai: snapshot.reserves['player-one'],
      human: snapshot.reserves['player-two'],
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

      <section className={gameStyles.sessionScore} aria-label="Score de la série">
        <span>{seats?.left.username ?? 'Joueur 1'}</span>
        <strong>
          {snapshot.sessionScore['player-one']} – {snapshot.sessionScore['player-two']}
        </strong>
        <span>{seats?.right.username ?? 'Joueur 2'}</span>
      </section>

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
            initiative={snapshot.initiative === 'player-one'}
            name={seats?.left.username ?? 'Joueur 1'}
            prediction={
              revealedRound?.predictions['player-one'] ?? snapshot.predictions['player-one'] ?? null
            }
            reserve={snapshot.reserves['player-one']}
            side="left"
            winner={winner === 'player-one'}
          />
          <PlayerCard
            avatarUrl={seats?.right.avatarUrl}
            connected={seats?.right.connected ?? false}
            initiative={snapshot.initiative === 'player-two'}
            name={seats?.right.username ?? 'Joueur 2'}
            prediction={
              revealedRound?.predictions['player-two'] ?? snapshot.predictions['player-two'] ?? null
            }
            reserve={snapshot.reserves['player-two']}
            side="right"
            winner={winner === 'player-two'}
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
        {actionSeconds !== null &&
        snapshot.phase !== 'finished' &&
        snapshot.phase !== 'cancelled' ? (
          <DecisionTimer
            label={
              controls.hiddenChoices.length > 0 || controls.predictions.length > 0
                ? 'Votre temps'
                : 'Décision en cours'
            }
            seconds={actionSeconds}
          />
        ) : null}
      </section>

      {preferences.showReactions && network.reaction ? (
        <div className={gameStyles.reactionToast} role="status" aria-live="polite">
          <strong>{snapshot.players[network.reaction.playerId].username}</strong>
          <span>{reactionLabel(network.reaction.reaction)}</span>
        </div>
      ) : null}

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
                : `${snapshot.players[opponentPlayerId].username} remporte la partie`}
          </h2>
          <p>
            {snapshot.phase === 'cancelled'
              ? 'Aucun résultat ni gagnant ne sera enregistré.'
              : `Le duel s’est joué en ${snapshot.roundNumber} manches.`}
          </p>
          {snapshot.phase === 'finished' && rematch.kind === 'incoming' ? (
            <section className={gameStyles.rematchPrompt} aria-labelledby="rematch-request-title">
              <div>
                <p className={gameStyles.eyebrow}>Demande reçue</p>
                <h3 id="rematch-request-title">{rematch.requesterName} souhaite rejouer</h3>
                <p>Acceptez ou refusez avant la fin du temps imparti.</p>
              </div>
              {rematchSeconds !== null ? (
                <DecisionTimer label="Temps pour répondre" seconds={rematchSeconds} />
              ) : null}
              <div className={gameStyles.rematchChoices}>
                <button
                  className={gameStyles.primaryButton}
                  type="button"
                  onClick={() => client.send('session.rematch', { accept: true })}
                >
                  Accepter
                </button>
                <button
                  className={gameStyles.secondaryButton}
                  type="button"
                  onClick={() => client.send('session.rematch', { accept: false })}
                >
                  Refuser
                </button>
              </div>
            </section>
          ) : null}
          {snapshot.phase === 'finished' && rematch.kind === 'waiting' ? (
            <div className={gameStyles.rematchWaiting} role="status">
              <p>Demande envoyée à {rematch.opponentName}.</p>
              {rematchSeconds !== null ? (
                <DecisionTimer label="Temps de réponse" seconds={rematchSeconds} />
              ) : null}
            </div>
          ) : null}
          {snapshot.phase === 'finished' && rematch.kind === 'declined' ? (
            <p className={gameStyles.rematchDeclined} role="status">
              {rematch.playerName} a refusé de rejouer.
            </p>
          ) : null}
          <div className={gameStyles.resultActions}>
            {snapshot.phase === 'finished' && rematch.kind === 'idle' ? (
              <button
                className={gameStyles.primaryButton}
                type="button"
                onClick={() => client.send('session.rematch', { accept: true })}
              >
                Rejouer
              </button>
            ) : null}
            <button className={gameStyles.secondaryButton} type="button" onClick={onExit}>
              Retour à l’accueil
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function DecisionTimer({ label, seconds }: { readonly label: string; readonly seconds: number }) {
  return (
    <div
      className={gameStyles.decisionTimer}
      data-urgent={seconds <= 5}
      role="timer"
      aria-label={`${label} : ${seconds} secondes`}
    >
      <span>{label}</span>
      <strong>{seconds}</strong>
      <small>s</small>
    </div>
  );
}

function useServerCountdown(
  deadline: number | null,
  serverNow: number,
  sequence: number,
): number | null {
  const [seconds, setSeconds] = useState<number | null>(() =>
    remainingSeconds(deadline, serverNow),
  );

  useEffect(() => {
    const receivedAt = Date.now();
    const update = () => {
      const estimatedServerNow = serverNow + Math.max(0, Date.now() - receivedAt);
      setSeconds(remainingSeconds(deadline, estimatedServerNow));
    };
    update();
    if (deadline === null) {
      return;
    }
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, sequence, serverNow]);

  return seconds;
}
