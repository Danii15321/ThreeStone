import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerProfile } from '@three-stone/api-contracts';

import logoUrl from '../assets/threestone-logo.jpg';
import { ApiClient, type SessionSnapshot } from '../adapters/http/api-client.js';
import { AccountPanel } from '../features/account/AccountPanel.js';
import { buildSoloResultPayload } from '../features/account/account-sync.js';
import { MultiplayerLobby } from '../features/multiplayer/MultiplayerLobby.js';
import { GameScreen } from '../features/solo-game/GameScreen.js';
import type { SoloSnapshot } from '../features/solo-game/solo-game-controller.js';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Difficulty,
  type UserPreferences,
} from '../features/settings/preferences.js';
import { GameSettingsPanel } from './GameSettingsPanel.js';
import { HomeScreen } from './HomeScreen.js';
import styles from './App.module.css';

type View = 'account' | 'game' | 'home' | 'multiplayer' | 'rules' | 'settings';

export function App() {
  const apiClient = useMemo(() => new ApiClient(import.meta.env.VITE_API_URL ?? ''), []);
  const [view, setView] = useState<View>('home');
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    typeof window === 'undefined' ? DEFAULT_PREFERENCES : loadPreferences(window.localStorage),
  );
  const [sequenceNumber, setSequenceNumber] = useState(() => readSequenceNumber());
  const [gameKey, setGameKey] = useState(1);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);

  const updateSession = useCallback((nextSession: SessionSnapshot | null): void => {
    setSession(nextSession);
    if (!nextSession) {
      setPlayerProfile(null);
    }
  }, []);

  const updatePreferences = useCallback((next: UserPreferences): void => {
    setPreferences(next);
    if (typeof window !== 'undefined') {
      savePreferences(window.localStorage, next);
    }
  }, []);

  const startSolo = useCallback(
    (difficulty: Difficulty): void => {
      updatePreferences({ ...preferences, difficulty });
      setView('game');
    },
    [preferences, updatePreferences],
  );

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getSession()
      .then((nextSession) => {
        if (!cancelled) {
          updateSession(nextSession);
        }
      })
      .catch(() => {
        if (!cancelled) {
          updateSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, updateSession]);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      return;
    }

    void apiClient
      .getProfile()
      .then((profile) => {
        if (!cancelled) {
          setPlayerProfile(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient, session]);

  function finishGame(snapshot: SoloSnapshot): void {
    setSequenceNumber((current) => {
      const next = current + 1;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('three-stone.sequence.v1', String(next));
      }
      return next;
    });

    if (session) {
      void apiClient
        .recordSoloResult(buildSoloResultPayload(snapshot, preferences.difficulty, new Date()))
        .catch(() => undefined);
    }
  }

  if (view === 'game') {
    return (
      <GameScreen
        key={gameKey}
        onExit={() => setView('home')}
        onFinished={finishGame}
        onReplay={() => setGameKey((current) => current + 1)}
        playerAvatarUrl={
          playerProfile?.hasAvatar
            ? apiClient.profileAvatarUrl(playerProfile.version)
            : session?.user.image
        }
        playerName={session?.user.displayUsername ?? 'Joueur'}
        preferences={preferences}
        sequenceNumber={sequenceNumber}
      />
    );
  }

  if (view === 'multiplayer') {
    return (
      <MultiplayerLobby
        client={apiClient}
        gameServerUrl={import.meta.env.VITE_GAME_SERVER_URL ?? 'ws://127.0.0.1:2567'}
        onExit={() => setView('home')}
        onLogin={() => setView('account')}
        preferences={preferences}
        session={session}
      />
    );
  }

  return (
    <main className={styles.page} data-high-contrast={preferences.highContrast}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="ThreeStone, accueil">
          <img alt="" src={logoUrl} />
          <span>ThreeStone</span>
        </a>
        <nav aria-label="Navigation principale">
          <button type="button" onClick={() => setView('settings')}>
            Paramètres du jeu
          </button>
          <button type="button" onClick={() => setView('account')}>
            Mon compte
          </button>
        </nav>
      </header>

      {view === 'home' ? (
        <HomeScreen
          onRules={() => setView('rules')}
          onStartMultiplayer={() => setView('multiplayer')}
          onStartSolo={startSolo}
          preferences={preferences}
        />
      ) : null}
      {view === 'rules' ? <Rules onClose={() => setView('home')} /> : null}
      {view === 'settings' ? (
        <GameSettingsPanel
          onClose={() => setView('home')}
          onPreferences={updatePreferences}
          preferences={preferences}
        />
      ) : null}
      {view === 'account' ? (
        <AccountPanel
          client={apiClient}
          onClose={() => setView('home')}
          onProfile={setPlayerProfile}
          onPreferences={updatePreferences}
          onSession={updateSession}
          preferences={preferences}
          session={session}
        />
      ) : null}
    </main>
  );
}

function Rules({ onClose }: { readonly onClose: () => void }) {
  return (
    <section className={styles.contentPanel} aria-labelledby="rules-title">
      <p className={styles.eyebrow}>Version 1.0.0</p>
      <h1 id="rules-title">Règles du jeu</h1>
      <ol>
        <li>Chaque joueur cache entre zéro et le nombre de cailloux de sa réserve.</li>
        <li>À tour de rôle, chacun annonce une somme de 0 à 6, différente de l’autre.</li>
        <li>Les mains sont révélées. Une annonce exacte permet de déposer un caillou.</li>
        <li>Le premier joueur dont la réserve atteint zéro remporte la partie.</li>
      </ol>
      <p>
        Le premier pronostic alterne à chaque manche. Une annonce impossible est autorisée : le
        bluff fait partie du jeu.
      </p>
      <button className={styles.secondaryButton} type="button" onClick={onClose}>
        Retour à l’accueil
      </button>
    </section>
  );
}

function readSequenceNumber(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  const value = Number(window.localStorage.getItem('three-stone.sequence.v1'));
  return Number.isInteger(value) && value > 0 ? value : 1;
}
