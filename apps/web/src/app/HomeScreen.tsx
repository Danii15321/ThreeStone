import { useEffect, useState } from 'react';

import handsUrl from '../assets/threestone-home-hands.webp';
import type { Difficulty, UserPreferences } from '../features/settings/preferences.js';
import styles from './App.module.css';

type LaunchStep = 'closed' | 'difficulty' | 'loading' | 'mode';

interface HomeScreenProps {
  readonly onRules: () => void;
  readonly onStartMultiplayer: () => void;
  readonly onStartSolo: (difficulty: Difficulty) => void;
  readonly preferences: UserPreferences;
}

export function HomeScreen({
  onRules,
  onStartMultiplayer,
  onStartSolo,
  preferences,
}: HomeScreenProps) {
  const [launchStep, setLaunchStep] = useState<LaunchStep>('closed');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(preferences.difficulty);

  useEffect(() => {
    if (launchStep !== 'loading') {
      return;
    }

    const timer = window.setTimeout(
      () => onStartSolo(selectedDifficulty),
      shouldReduceMotion(preferences) ? 120 : 850,
    );
    return () => window.clearTimeout(timer);
  }, [launchStep, onStartSolo, preferences, selectedDifficulty]);

  useEffect(() => {
    if (launchStep === 'closed' || launchStep === 'loading') {
      return;
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setLaunchStep('closed');
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [launchStep]);

  function selectDifficulty(difficulty: Difficulty): void {
    setSelectedDifficulty(difficulty);
    setLaunchStep('loading');
  }

  return (
    <section className={styles.home} id="top" aria-labelledby="home-title">
      <img
        className={styles.homeBackground}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        src={handsUrl}
      />
      <div className={styles.homeShade} aria-hidden="true" />
      <div className={styles.homeContent}>
        <div className={styles.homeTitle}>
          <h1 id="home-title">ThreeStone</h1>
          <p>Art du bluff ou science de la déduction</p>
        </div>
        <div className={styles.homeActions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => setLaunchStep('mode')}
          >
            Commencez une partie
          </button>
          <button className={styles.secondaryButton} type="button" onClick={onRules}>
            Comment jouer
          </button>
        </div>
      </div>

      {launchStep !== 'closed' ? (
        <LaunchDialog
          launchStep={launchStep}
          onClose={() => setLaunchStep('closed')}
          onDifficulty={() => setLaunchStep('difficulty')}
          onMode={() => setLaunchStep('mode')}
          onMultiplayer={onStartMultiplayer}
          onSelectDifficulty={selectDifficulty}
        />
      ) : null}
    </section>
  );
}

interface LaunchDialogProps {
  readonly launchStep: Exclude<LaunchStep, 'closed'>;
  readonly onClose: () => void;
  readonly onDifficulty: () => void;
  readonly onMode: () => void;
  readonly onMultiplayer: () => void;
  readonly onSelectDifficulty: (difficulty: Difficulty) => void;
}

function LaunchDialog({
  launchStep,
  onClose,
  onDifficulty,
  onMode,
  onMultiplayer,
  onSelectDifficulty,
}: LaunchDialogProps) {
  const title =
    launchStep === 'mode'
      ? 'Choisissez votre mode'
      : launchStep === 'difficulty'
        ? 'Choisissez la difficulté'
        : 'Préparation de la table';

  return (
    <div className={styles.dialogBackdrop}>
      <section
        className={styles.launchDialog}
        role="dialog"
        aria-labelledby="launch-title"
        aria-modal="true"
      >
        {launchStep !== 'loading' ? (
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
        <p className={styles.dialogEyebrow}>ThreeStone</p>
        <h2 id="launch-title">{title}</h2>

        {launchStep === 'mode' ? (
          <div className={styles.modeGrid}>
            <button className={styles.choiceCard} type="button" autoFocus onClick={onDifficulty}>
              <span className={styles.choiceIcon} aria-hidden="true">
                ◆
              </span>
              <strong>Mode solo</strong>
              <small>Affrontez une IA loyale et imprévisible.</small>
            </button>
            <button className={styles.choiceCard} type="button" onClick={onMultiplayer}>
              <span className={styles.versionBadge}>V2</span>
              <span className={styles.choiceIcon} aria-hidden="true">
                ◈
              </span>
              <strong>Multijoueur</strong>
              <small>Invitez un autre joueur dans un salon privé.</small>
            </button>
          </div>
        ) : null}

        {launchStep === 'difficulty' ? (
          <>
            <div className={styles.difficultyGrid}>
              <DifficultyButton label="Facile" onClick={() => onSelectDifficulty('easy')} />
              <DifficultyButton label="Moyen" onClick={() => onSelectDifficulty('normal')} />
              <DifficultyButton label="Difficile" onClick={() => onSelectDifficulty('hard')} />
            </div>
            <button className={styles.textButton} type="button" onClick={onMode}>
              ← Retour aux modes
            </button>
          </>
        ) : null}

        {launchStep === 'loading' ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <div className={styles.loadingStones} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>Préparation de la table…</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DifficultyButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button className={styles.difficultyCard} type="button" onClick={onClick}>
      <strong>{label}</strong>
    </button>
  );
}

function shouldReduceMotion(preferences: UserPreferences): boolean {
  return (
    preferences.motion === 'reduced' ||
    (preferences.motion === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
