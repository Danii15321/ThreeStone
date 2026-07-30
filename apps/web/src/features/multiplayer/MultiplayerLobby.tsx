import { useState } from 'react';

import type {
  CreateMultiplayerRoomResponse,
  JoinMultiplayerRoomResponse,
} from '@three-stone/api-contracts';

import type { ApiClient, SessionSnapshot } from '../../adapters/http/api-client.js';
import type { UserPreferences } from '../settings/preferences.js';
import { MultiplayerGameScreen } from './MultiplayerGameScreen.js';
import styles from './MultiplayerLobby.module.css';

type Admission = CreateMultiplayerRoomResponse | JoinMultiplayerRoomResponse;
type Step = 'join' | 'menu';

interface MultiplayerLobbyProps {
  readonly client: ApiClient;
  readonly onExit: () => void;
  readonly onLogin: () => void;
  readonly preferences: UserPreferences;
  readonly session: SessionSnapshot | null;
}

export function MultiplayerLobby({
  client,
  onExit,
  onLogin,
  preferences,
  session,
}: MultiplayerLobbyProps) {
  const [step, setStep] = useState<Step>('menu');
  const [code, setCode] = useState('');
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setAdmission(await client.createMultiplayerRoom());
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAdmission(await client.joinMultiplayerRoom(code));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  if (admission !== null && session !== null) {
    return (
      <MultiplayerGameScreen admission={admission} onExit={onExit} preferences={preferences} />
    );
  }

  return (
    <main className={styles.shell} data-high-contrast={preferences.highContrast}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Duel privé · V2</p>
          <h1>ThreeStone</h1>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onExit}>
          Retour à l’accueil
        </button>
      </header>

      {session === null ? (
        <section className={styles.panel} aria-labelledby="login-required-title">
          <p className={styles.eyebrow}>Connexion requise</p>
          <h2 id="login-required-title">Entrez dans l’arène</h2>
          <p className={styles.panelText}>
            Un compte ThreeStone est nécessaire pour réserver votre siège et retrouver vos parties.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryButton} type="button" onClick={onLogin}>
              Se connecter
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onExit}>
              Plus tard
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby="multiplayer-lobby-title">
          <p className={styles.eyebrow}>Bienvenue, {session.user.displayUsername}</p>
          <h2 id="multiplayer-lobby-title">
            {step === 'menu' ? 'Choisissez votre table' : 'Rejoignez un duel'}
          </h2>

          {step === 'menu' ? (
            <div className={styles.modeGrid}>
              <button
                className={styles.modeCard}
                disabled={busy}
                type="button"
                onClick={() => void createRoom()}
              >
                <span aria-hidden="true">◇</span>
                <strong>Créer un salon</strong>
                <small>Recevez un code privé à transmettre à votre adversaire.</small>
              </button>
              <button
                className={styles.modeCard}
                disabled={busy}
                type="button"
                onClick={() => setStep('join')}
              >
                <span aria-hidden="true">⚔</span>
                <strong>Rejoindre</strong>
                <small>Saisissez le code à six caractères reçu d’un autre joueur.</small>
              </button>
            </div>
          ) : (
            <form className={styles.joinForm} onSubmit={(event) => void joinRoom(event)}>
              <label>
                Code d’invitation
                <input
                  autoComplete="off"
                  autoFocus
                  inputMode="text"
                  maxLength={6}
                  minLength={6}
                  pattern="[23456789A-HJ-NP-Z]{6}"
                  required
                  value={code}
                  onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
                />
              </label>
              <button className={styles.primaryButton} disabled={busy} type="submit">
                {busy ? 'Recherche du salon…' : 'Prendre place'}
              </button>
              <button className={styles.textButton} type="button" onClick={() => setStep('menu')}>
                ← Retour
              </button>
            </form>
          )}

          {busy && step === 'menu' ? (
            <p className={styles.panelText} role="status">
              Préparation de votre table…
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}

function messageFrom(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Le salon est momentanément indisponible.';
}
