import { useEffect, useState } from 'react';

import { createBoardModel } from '../../game/board-model.js';
import { PhaserBoard } from '../../game/PhaserBoard.js';
import type { UserPreferences } from '../settings/preferences.js';
import { normalizePredictionValue } from './game-controls.js';
import {
  advanceRoundPresentation,
  createRoundPresentation,
  difficultyLabel,
  getVisiblePredictions,
  type GameSeat,
  type RoundPresentation,
} from './game-presentation.js';
import {
  getSoloSnapshot,
  listHumanActions,
  playHumanAction,
  startSoloGame,
  type SoloCommand,
  type SoloSession,
  type SoloSnapshot,
} from './solo-game-controller.js';
import styles from './GameScreen.module.css';

interface GameScreenProps {
  readonly onExit: () => void;
  readonly onFinished: (snapshot: SoloSnapshot) => void;
  readonly onReplay: () => void;
  readonly playerAvatarUrl: string | null | undefined;
  readonly playerName: string;
  readonly preferences: UserPreferences;
  readonly sequenceNumber: number;
}

export function GameScreen({
  onExit,
  onFinished,
  onReplay,
  playerAvatarUrl,
  playerName,
  preferences,
  sequenceNumber,
}: GameScreenProps) {
  const [session, setSession] = useState<SoloSession>(() =>
    startSoloGame({
      difficulty: preferences.difficulty,
      gameId: createGameId(),
      seed: createSeed(),
      sequenceNumber,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedStones, setSelectedStones] = useState<ReadonlySet<number>>(() => new Set());
  const [predictionValue, setPredictionValue] = useState(0);
  const [presentation, setPresentation] = useState<RoundPresentation | null>(null);
  const snapshot = getSoloSnapshot(session);
  const humanActions = listHumanActions(session);
  const reducedMotion = shouldReduceMotion(preferences);
  const controlsLocked = presentation !== null;

  const choiceActions = humanActions.filter(
    (action): action is Extract<SoloCommand, { type: 'choose-hidden' }> =>
      action.type === 'choose-hidden',
  );
  const predictionActions = humanActions.filter(
    (action): action is Extract<SoloCommand, { type: 'predict' }> => action.type === 'predict',
  );
  const legalPredictions = predictionActions.map((action) => action.value);
  const activePrediction = legalPredictions.includes(predictionValue)
    ? predictionValue
    : (legalPredictions[0] ?? 0);
  const forbiddenPrediction =
    snapshot.phase === 'second-prediction' ? snapshot.predictions.ai : null;

  const visiblePredictions = presentation
    ? getVisiblePredictions(presentation)
    : snapshot.predictions;
  const shownReserves =
    presentation && presentation.stage !== 'resolved'
      ? presentation.reservesBefore
      : snapshot.reserves;
  const shownAiReserve = shownReserves.ai;
  const shownHumanReserve = shownReserves.human;
  const boardPose =
    presentation?.stage === 'revealed' || presentation?.stage === 'resolved'
      ? 'revealed'
      : snapshot.phase === 'finished' && presentation === null
        ? snapshot.winner === 'human'
          ? 'human-victory'
          : 'ai-victory'
        : 'closed';
  const boardDropStone = presentation?.stage === 'resolved' ? presentation.dropStone : null;
  const boardReveal = presentation?.reveal ?? null;
  const finalWinner =
    snapshot.phase === 'finished' && presentation === null ? snapshot.winner : null;
  const boardModel = createBoardModel({
    dropStone: boardDropStone,
    pose: boardPose,
    reserves: { ai: shownAiReserve, human: shownHumanReserve },
    reveal: boardReveal,
  });
  useEffect(() => {
    if (!presentation) {
      return;
    }

    const timeout = window.setTimeout(
      () => setPresentation((current) => (current ? advanceRoundPresentation(current) : null)),
      presentationDelay(presentation, reducedMotion),
    );
    return () => window.clearTimeout(timeout);
  }, [presentation, reducedMotion]);

  function submit(action: SoloCommand): void {
    const beforeSnapshot = getSoloSnapshot(session);
    const transition = playHumanAction(session, action);
    if (!transition.ok) {
      setError(transition.error.message);
      return;
    }

    const nextSnapshot = getSoloSnapshot(transition.session);
    setError(null);
    setSession(transition.session);
    if (action.type === 'choose-hidden') {
      setSelectedStones(new Set());
    }
    if (
      transition.events.some((event) => event.type === 'hands-revealed') &&
      nextSnapshot.lastReveal
    ) {
      setPresentation(
        createRoundPresentation({
          existingPredictions: beforeSnapshot.predictions,
          initiative: beforeSnapshot.initiative,
          reservesAfter: nextSnapshot.reserves,
          reservesBefore: beforeSnapshot.reserves,
          reveal: nextSnapshot.lastReveal,
          roundNumber: nextSnapshot.lastReveal.roundNumber,
        }),
      );
    }

    if (nextSnapshot.phase === 'finished') {
      onFinished(nextSnapshot);
    }
  }

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

  function changePrediction(nextValue: number): number {
    const normalized = normalizePredictionValue(nextValue, activePrediction, legalPredictions);
    setPredictionValue(normalized);
    return normalized;
  }

  return (
    <main className={styles.game} data-high-contrast={preferences.highContrast}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>
            Partie solo · manche {presentation?.roundNumber ?? snapshot.roundNumber}
          </p>
          <h1>ThreeStone</h1>
          <span className={styles.difficultyBadge}>
            Difficulté · {difficultyLabel(preferences.difficulty)}
          </span>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onExit}>
          Quitter la partie
        </button>
      </header>

      <section className={styles.arena} aria-label="Table de jeu">
        <PhaserBoard
          highContrast={preferences.highContrast}
          model={boardModel}
          reducedMotion={reducedMotion}
        />
        <div className={styles.profiles}>
          <PlayerProfile
            initiative={
              presentation?.initiative === 'ai' || (!presentation && snapshot.initiative === 'ai')
            }
            name="Ordinateur"
            prediction={visiblePredictions.ai}
            reserve={shownReserves.ai}
            seat="ai"
            winner={finalWinner === 'ai'}
          />
          <PlayerProfile
            avatarUrl={playerAvatarUrl}
            initiative={
              presentation?.initiative === 'human' ||
              (!presentation && snapshot.initiative === 'human')
            }
            name={playerName}
            prediction={visiblePredictions.human}
            reserve={shownReserves.human}
            seat="human"
            winner={finalWinner === 'human'}
          />
        </div>
      </section>

      <section className={styles.status} aria-live="polite" aria-atomic="true">
        <span className={styles.statusRune} aria-hidden="true">
          ◆
        </span>
        <div>
          <p className={styles.statusTitle}>{statusMessage(snapshot, presentation, playerName)}</p>
          {presentation?.stage === 'revealed' || presentation?.stage === 'resolved' ? (
            <p className={styles.reveal}>
              {presentation.reveal.choices.ai} + {presentation.reveal.choices.human} ={' '}
              <strong>{presentation.reveal.total}</strong>
            </p>
          ) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>

      {!controlsLocked && choiceActions.length > 0 ? (
        <StonePicker
          onConfirm={() => submit({ type: 'choose-hidden', count: selectedStones.size })}
          onToggle={toggleStone}
          reserve={snapshot.reserves.human}
          selected={selectedStones}
        />
      ) : null}

      {!controlsLocked && predictionActions.length > 0 ? (
        <PredictionSlider
          forbiddenValue={forbiddenPrediction}
          onChange={changePrediction}
          onConfirm={() => submit({ type: 'predict', value: activePrediction })}
          value={activePrediction}
        />
      ) : null}

      {snapshot.phase === 'finished' && !presentation ? (
        <section className={styles.result} aria-labelledby="result-title">
          <p className={styles.eyebrow}>Partie terminée</p>
          <h2 id="result-title">
            {snapshot.winner === 'human' ? 'Victoire !' : "L'ordinateur gagne cette partie"}
          </h2>
          <p>
            La partie s’est jouée en {snapshot.roundNumber} manches. Le résultat sera synchronisé
            avec votre compte si vous êtes connecté.
          </p>
          <div className={styles.resultActions}>
            <button className={styles.primaryButton} type="button" onClick={onReplay}>
              Rejouer
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onExit}>
              Retour à l’accueil
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

interface PlayerProfileProps {
  readonly avatarUrl?: string | null | undefined;
  readonly initiative: boolean;
  readonly name: string;
  readonly prediction: number | null;
  readonly reserve: number;
  readonly seat: GameSeat;
  readonly winner: boolean;
}

function PlayerProfile({
  avatarUrl,
  initiative,
  name,
  prediction,
  reserve,
  seat,
  winner,
}: PlayerProfileProps) {
  return (
    <section
      className={`${styles.playerProfile} ${
        seat === 'human' ? styles.humanProfile : styles.aiProfile
      } ${winner ? styles.winnerProfile : ''}`}
      aria-label={name}
    >
      <div className={styles.identity}>
        {winner ? (
          <span
            aria-label={`Couronne de victoire de ${name}`}
            className={styles.winnerCrown}
            role="img"
          >
            ♛
          </span>
        ) : null}
        <div className={styles.avatar}>
          {avatarUrl ? (
            <img alt={`Avatar de ${name}`} src={avatarUrl} />
          ) : (
            <span aria-hidden="true">{seat === 'ai' ? '✦' : playerInitial(name)}</span>
          )}
        </div>
        <strong>{name}</strong>
        <div className={styles.reserve} aria-label={`${reserve} cailloux restants`}>
          <span className={styles.miniStones} aria-hidden="true">
            {Array.from({ length: reserve }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span>
            {reserve} caillou{reserve > 1 ? 'x' : ''}
          </span>
        </div>
        {initiative ? <span className={styles.initiative}>Annonce en premier</span> : null}
      </div>
      {prediction !== null ? (
        <p className={styles.predictionBubble}>
          La somme sera <strong>{prediction}</strong>
        </p>
      ) : null}
    </section>
  );
}

interface StonePickerProps {
  readonly onConfirm: () => void;
  readonly onToggle: (index: number) => void;
  readonly reserve: number;
  readonly selected: ReadonlySet<number>;
}

function StonePicker({ onConfirm, onToggle, reserve, selected }: StonePickerProps) {
  return (
    <fieldset className={styles.controlPanel}>
      <legend>Choisissez vos cailloux</legend>
      <p className={styles.controlHint}>
        Touchez les cailloux à cacher dans votre main. Aucun choix signifie zéro.
      </p>
      <div className={styles.stonePicker}>
        {Array.from({ length: reserve }, (_, index) => (
          <button
            aria-label={`Caillou ${index + 1}`}
            aria-pressed={selected.has(index)}
            className={styles.selectableStone}
            key={index}
            type="button"
            onClick={() => onToggle(index)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className={styles.controlFooter}>
        <p>
          <strong>{selected.size}</strong> sélectionné{selected.size > 1 ? 's' : ''}
        </p>
        <button
          aria-label="Valider mon choix"
          className={styles.primaryButton}
          type="button"
          onClick={onConfirm}
        >
          Valider mon choix · {selected.size}
        </button>
      </div>
    </fieldset>
  );
}

interface PredictionSliderProps {
  readonly forbiddenValue: number | null;
  readonly onChange: (value: number) => number;
  readonly onConfirm: () => void;
  readonly value: number;
}

function PredictionSlider({ forbiddenValue, onChange, onConfirm, value }: PredictionSliderProps) {
  return (
    <fieldset className={styles.controlPanel}>
      <legend>Faites votre pronostic</legend>
      <div className={styles.sliderHeader}>
        <p className={styles.controlHint}>Quelle sera la somme des deux mains ?</p>
        <output htmlFor="prediction-slider">{value}</output>
      </div>
      <input
        aria-valuetext={`${value}, somme annoncée`}
        id="prediction-slider"
        max="6"
        min="0"
        name="prediction"
        step="1"
        type="range"
        value={value}
        aria-label="Votre pronostic"
        onChange={(event) => {
          const normalized = onChange(Number(event.currentTarget.value));
          event.currentTarget.value = String(normalized);
        }}
      />
      <div className={styles.sliderTicks} aria-hidden="true">
        {Array.from({ length: 7 }, (_, tick) => (
          <span className={tick === forbiddenValue ? styles.forbiddenTick : undefined} key={tick}>
            {tick}
          </span>
        ))}
      </div>
      <div className={styles.controlFooter}>
        <p>
          {forbiddenValue === null
            ? 'Vous ouvrez les annonces.'
            : `Le ${forbiddenValue} est déjà annoncé par l’ordinateur.`}
        </p>
        <button className={styles.primaryButton} type="button" onClick={onConfirm}>
          Annoncer {value}
        </button>
      </div>
    </fieldset>
  );
}

function statusMessage(
  snapshot: SoloSnapshot,
  presentation: RoundPresentation | null,
  playerName: string,
): string {
  if (presentation) {
    const predictions = presentation.reveal.predictions;
    if (presentation.stage === 'first-predicted') {
      return presentation.initiative === 'human'
        ? `${playerName} annonce ${predictions.human}. L’ordinateur réfléchit…`
        : `L’ordinateur annonce ${predictions.ai}. À vous de répondre.`;
    }
    if (presentation.stage === 'both-predicted') {
      const second = presentation.initiative === 'human' ? 'ai' : 'human';
      return second === 'ai'
        ? `L’ordinateur répond ${predictions.ai}. Les deux pronostics sont verrouillés.`
        : `${playerName} répond ${predictions.human}. Les deux pronostics sont verrouillés.`;
    }
    if (presentation.stage === 'revealed') {
      return 'Ouverture des mains… Comptez les cailloux.';
    }
    if (presentation.reveal.winner === null) {
      return 'Aucun pronostic exact. La main se referme pour une nouvelle manche.';
    }
    return presentation.reveal.winner === 'human'
      ? 'Pronostic exact ! Vous jetez un caillou.'
      : 'Pronostic exact pour l’ordinateur : il jette un caillou.';
  }

  if (snapshot.phase === 'finished') {
    return snapshot.winner === 'human'
      ? 'Vous avez jeté votre dernier caillou.'
      : "L'ordinateur a jeté son dernier caillou.";
  }
  if (snapshot.phase === 'hidden-choices') {
    return 'Choisissez vos cailloux. L’ordinateur prépare sa main en secret.';
  }
  if (snapshot.phase === 'first-prediction') {
    return 'Les deux mains sont fermées. Vous annoncez en premier cette manche.';
  }
  return `L’ordinateur annonce ${snapshot.predictions.ai}. Choisissez une autre somme.`;
}

function presentationDelay(presentation: RoundPresentation, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 80;
  }
  const delays = {
    'first-predicted': 1050,
    'both-predicted': 1100,
    revealed: 2200,
    resolved: 1400,
  } as const;
  return delays[presentation.stage];
}

function playerInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase('fr') || 'J';
}

function createGameId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-000000000001';
}

function createSeed(): number {
  return typeof crypto === 'undefined' ? 1 : (crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
}

function shouldReduceMotion(preferences: UserPreferences): boolean {
  return (
    preferences.motion === 'reduced' ||
    (preferences.motion === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
