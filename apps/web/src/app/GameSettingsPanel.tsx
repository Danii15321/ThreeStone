import type { UserPreferences } from '../features/settings/preferences.js';
import styles from './App.module.css';

interface GameSettingsPanelProps {
  readonly onClose: () => void;
  readonly onPreferences: (preferences: UserPreferences) => void;
  readonly preferences: UserPreferences;
}

export function GameSettingsPanel({ onClose, onPreferences, preferences }: GameSettingsPanelProps) {
  return (
    <section className={styles.settingsPage} aria-labelledby="settings-title">
      <div className={styles.panelHeading}>
        <p className={styles.eyebrow}>Confort de jeu</p>
        <h1 id="settings-title">Paramètres du jeu</h1>
        <p>Adaptez l’ambiance et l’affichage. Ces choix sont conservés sur cet appareil.</p>
      </div>

      <div className={styles.settingsList}>
        <label className={styles.settingRow}>
          <span>
            <strong>Mode muet</strong>
            <small>Coupez les sons des boutons de jeu.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.muted}
            onChange={(event) => onPreferences({ ...preferences, muted: event.target.checked })}
          />
        </label>

        <label className={styles.settingRow}>
          <span>
            <strong>Volume des effets</strong>
            <small>Réglez l’intensité des sons des boutons.</small>
          </span>
          <input
            aria-label="Volume des effets"
            disabled={preferences.muted}
            max="1"
            min="0"
            step="0.1"
            type="range"
            value={preferences.soundVolume}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                soundVolume: Number(event.target.value),
              })
            }
          />
        </label>

        <label className={styles.settingRow}>
          <span>
            <strong>Mouvements</strong>
            <small>Réduisez les animations si vous le souhaitez.</small>
          </span>
          <select
            value={preferences.motion}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                motion: event.target.value as UserPreferences['motion'],
              })
            }
          >
            <option value="system">Réglage du système</option>
            <option value="full">Complets</option>
            <option value="reduced">Réduits</option>
          </select>
        </label>

        <label className={styles.settingRow}>
          <span>
            <strong>Contraste renforcé</strong>
            <small>Accentuez les contours et la lisibilité des textes.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.highContrast}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                highContrast: event.target.checked,
              })
            }
          />
        </label>
      </div>

      <button className={styles.secondaryButton} type="button" onClick={onClose}>
        Retour à l’accueil
      </button>
    </section>
  );
}
