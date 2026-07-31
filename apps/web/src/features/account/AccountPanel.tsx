import type {
  MultiplayerGameHistory,
  MultiplayerStats,
  PlayerProfile,
  SoloGameResult,
  SoloResultHistory,
  SoloStats,
} from '@three-stone/api-contracts';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiClientError,
  type ApiClient,
  type SessionSnapshot,
} from '../../adapters/http/api-client.js';
import stonesEmblem from '../../assets/stones-emblem.webp';
import type { UserPreferences } from '../settings/preferences.js';
import { fromRemotePreferences } from './account-sync.js';
import { MultiplayerHistoryCard } from './MultiplayerHistory.js';
import { mergeGameJournal } from './game-journal.js';
import styles from './AccountPanel.module.css';

interface AccountPanelProps {
  readonly client: ApiClient;
  readonly onClose: () => void;
  readonly onProfile: (profile: PlayerProfile | null) => void;
  readonly onPreferences: (preferences: UserPreferences) => void;
  readonly onSession: (session: SessionSnapshot | null) => void;
  readonly preferences: UserPreferences;
  readonly session: SessionSnapshot | null;
}

type AnonymousMode = 'sign-in' | 'sign-up';
type AccountView = 'privacy' | 'profile';

export function AccountPanel(props: AccountPanelProps) {
  return props.session ? (
    <AuthenticatedAccount {...props} session={props.session} />
  ) : (
    <AnonymousAccount {...props} />
  );
}

function AnonymousAccount({ client, onClose, onSession }: AccountPanelProps) {
  const [mode, setMode] = useState<AnonymousMode>('sign-in');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = {
      password: String(form.get('password') ?? ''),
      username: String(form.get('username') ?? ''),
    };
    setPending(true);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
        await client.signUp(credentials);
      }
      const session =
        mode === 'sign-up' ? await client.getSession() : await client.signIn(credentials);
      if (!session) {
        throw new Error('La session n’a pas pu être créée.');
      }
      onSession(session);
    } catch (error) {
      setMessage(toFrenchError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.authPanel} aria-labelledby="account-title">
      <button className={styles.backButton} type="button" onClick={onClose}>
        <span aria-hidden="true">←</span> Retour à l’accueil
      </button>
      <p className={styles.eyebrow}>Espace joueur</p>
      <h1 id="account-title">Mon compte</h1>
      <div className={styles.authTabs} role="tablist" aria-label="Accès au compte">
        <ModeButton current={mode} mode="sign-in" onMode={setMode}>
          Connexion
        </ModeButton>
        <ModeButton current={mode} mode="sign-up" onMode={setMode}>
          Inscription
        </ModeButton>
      </div>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label>
          Pseudonyme
          <input
            autoCapitalize="none"
            autoComplete="username"
            maxLength={24}
            minLength={3}
            name="username"
            pattern="[A-Za-z0-9_.]+"
            required
          />
          {mode === 'sign-up' ? (
            <small>3 à 24 caractères : lettres, chiffres, point et tiret bas.</small>
          ) : null}
        </label>
        <label>
          Mot de passe
          <input
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          {mode === 'sign-up' ? <small>12 caractères minimum.</small> : null}
        </label>
        <button className={styles.primaryButton} disabled={pending} type="submit">
          {pending ? 'Un instant…' : mode === 'sign-in' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>

      {message ? <StatusMessage message={message} /> : null}
    </section>
  );
}

function AuthenticatedAccount({
  client,
  onClose,
  onProfile,
  onPreferences,
  onSession,
  preferences,
  session,
}: AccountPanelProps & { readonly session: SessionSnapshot }) {
  const [view, setView] = useState<AccountView>('profile');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<SoloStats | null>(null);
  const [history, setHistory] = useState<SoloResultHistory | null>(null);
  const [multiplayerHistory, setMultiplayerHistory] = useState<MultiplayerGameHistory | null>(null);
  const [multiplayerStats, setMultiplayerStats] = useState<MultiplayerStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadOrCreateProfile(client),
      client.getPreferences(),
      client.getSoloStats(),
      client.getSoloHistory(5),
      client.getMultiplayerHistory(5),
      client.getMultiplayerStats(),
    ])
      .then(
        ([
          nextProfile,
          remotePreferences,
          nextStats,
          nextHistory,
          nextMultiplayerHistory,
          nextMultiplayerStats,
        ]) => {
          if (cancelled) return;
          setProfile(nextProfile);
          onProfile(nextProfile);
          onPreferences({
            ...fromRemotePreferences(remotePreferences),
            showReactions: preferences.showReactions,
          });
          setStats(nextStats);
          setHistory(nextHistory);
          setMultiplayerHistory(nextMultiplayerHistory);
          setMultiplayerStats(nextMultiplayerStats);
        },
      )
      .catch((error: unknown) => {
        if (!cancelled) setMessage(toFrenchError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [client, onPreferences, onProfile, preferences.showReactions, session.user.id]);

  function updateVisibleProfile(nextProfile: PlayerProfile): void {
    setProfile(nextProfile);
    onProfile(nextProfile);
  }

  async function signOut(): Promise<void> {
    try {
      await client.signOut();
      onSession(null);
    } catch (error) {
      setMessage(toFrenchError(error));
    }
  }

  return (
    <section className={styles.accountPage} aria-labelledby="account-title">
      <header className={styles.accountHeader}>
        <button className={styles.backButton} type="button" onClick={onClose}>
          <span aria-hidden="true">←</span> Retour à l’accueil
        </button>
        <div className={styles.accountTabs} role="tablist" aria-label="Rubriques du compte">
          <AccountTab current={view} mode="profile" onMode={setView}>
            Profil
          </AccountTab>
          <AccountTab current={view} mode="privacy" onMode={setView}>
            Confidentialité
          </AccountTab>
        </div>
      </header>

      {view === 'profile' ? (
        <ProfileView
          client={client}
          history={history}
          multiplayerHistory={multiplayerHistory}
          multiplayerStats={multiplayerStats}
          onSignOut={() => void signOut()}
          profile={profile}
          session={session}
          stats={stats}
        />
      ) : (
        <PrivacyView
          client={client}
          onMessage={setMessage}
          onProfile={updateVisibleProfile}
          onSession={onSession}
          profile={profile}
          session={session}
        />
      )}

      {message ? <StatusMessage message={message} /> : null}
    </section>
  );
}

function ProfileView({
  client,
  history,
  multiplayerHistory,
  multiplayerStats,
  onSignOut,
  profile,
  session,
  stats,
}: {
  readonly client: ApiClient;
  readonly history: SoloResultHistory | null;
  readonly multiplayerHistory: MultiplayerGameHistory | null;
  readonly multiplayerStats: MultiplayerStats | null;
  readonly onSignOut: () => void;
  readonly profile: PlayerProfile | null;
  readonly session: SessionSnapshot;
  readonly stats: SoloStats | null;
}) {
  const journal = mergeGameJournal(history?.items ?? [], multiplayerHistory?.items ?? [], 5);
  const gamesPlayed =
    stats === null || multiplayerStats === null
      ? undefined
      : stats.gamesPlayed + multiplayerStats.gamesPlayed;

  return (
    <div className={styles.profileView}>
      <section className={styles.playerCard} aria-labelledby="account-title">
        <div className={styles.banner} aria-hidden="true">
          <span className={styles.bannerStoneOne} />
          <span className={styles.bannerStoneTwo} />
          <span className={styles.bannerStoneThree} />
        </div>
        <div className={styles.identityBlock}>
          <Avatar client={client} profile={profile} session={session} />
          <div className={styles.identityCopy}>
            <p className={styles.eyebrow}>Joueur actif</p>
            <h1 id="account-title">{session.user.displayUsername}</h1>
            <p className={styles.handle}>@{session.user.username}</p>
            <p className={styles.bio}>
              {profile?.bio || 'Ce joueur garde encore sa stratégie secrète.'}
            </p>
          </div>
          <span className={styles.onlineBadge}>En ligne</span>
        </div>
      </section>

      <dl className={styles.stats}>
        <StatCard label="Parties jouées" value={gamesPlayed} />
        <StonesCard value={multiplayerStats?.stones} />
      </dl>

      <section className={styles.history} aria-labelledby="history-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Journal de jeu</p>
            <h2 id="history-title">Dernières parties</h2>
          </div>
          <span>{(history?.total ?? 0) + (multiplayerHistory?.total ?? 0)} au total</span>
        </div>
        {journal.length > 0 ? (
          <div className={styles.journalList}>
            {journal.map((entry) =>
              entry.mode === 'solo' ? (
                <HistoryCard key={`solo:${entry.game.gameId}`} result={entry.game} />
              ) : (
                <MultiplayerHistoryCard
                  game={entry.game}
                  key={`multiplayer:${entry.game.gameId}`}
                />
              ),
            )}
          </div>
        ) : (
          <div className={styles.emptyHistory}>
            <span aria-hidden="true">◇</span>
            <p>Aucune partie synchronisée pour le moment.</p>
          </div>
        )}
      </section>

      <div className={styles.profileActions}>
        <button className={styles.logoutButton} type="button" onClick={onSignOut}>
          <span aria-hidden="true">↪</span> Se déconnecter
        </button>
      </div>
    </div>
  );
}

function PrivacyView({
  client,
  onMessage,
  onProfile,
  onSession,
  profile,
  session,
}: {
  readonly client: ApiClient;
  readonly onMessage: (message: string | null) => void;
  readonly onProfile: (profile: PlayerProfile) => void;
  readonly onSession: (session: SessionSnapshot | null) => void;
  readonly profile: PlayerProfile | null;
  readonly session: SessionSnapshot;
}) {
  async function updateBio(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    try {
      const nextProfile = await client.updateProfile({
        bio: String(form.get('bio') ?? ''),
        expectedVersion: profile.version,
        nickname: profile.nickname,
      });
      onProfile(nextProfile);
      onMessage('Bio enregistrée.');
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profile) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const avatar = form.get('avatar');
    if (!(avatar instanceof File) || avatar.size === 0) {
      onMessage('Choisissez une image avant de continuer.');
      return;
    }
    if (avatar.size > 1024 * 1024) {
      onMessage('La photo doit peser moins de 1 Mo.');
      return;
    }
    try {
      onProfile(await client.uploadAvatar(avatar, profile.version));
      formElement.reset();
      onMessage('Photo de profil mise à jour.');
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  async function removeAvatar(): Promise<void> {
    if (!profile) return;
    try {
      onProfile(await client.deleteAvatar(profile.version));
      onMessage('Photo de profil supprimée.');
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  async function updateIdentity(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const nextSession = await client.updateUsername(String(form.get('username') ?? ''));
      if (!nextSession) throw new Error('La session n’a pas pu être actualisée.');
      onSession(nextSession);
      onMessage('Pseudonyme de connexion modifié.');
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await client.changePassword(
        String(form.get('currentPassword') ?? ''),
        String(form.get('newPassword') ?? ''),
      );
      formElement.reset();
      onMessage('Mot de passe modifié.');
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await client.deleteAccount(String(form.get('password') ?? ''));
      onSession(null);
    } catch (error) {
      onMessage(toFrenchError(error));
    }
  }

  return (
    <div className={styles.privacyView}>
      <div className={styles.privacyIntro}>
        <p className={styles.eyebrow}>Paramètres personnels</p>
        <h1 id="account-title">Confidentialité</h1>
        <p>
          Modifiez seulement ce dont vous avez besoin. Chaque panneau reste fermé pour garder la
          page lisible.
        </p>
      </div>

      <div className={styles.disclosures}>
        <details className={styles.disclosure}>
          <summary>
            <span className={styles.summaryIcon} aria-hidden="true">
              ◇
            </span>
            <span>
              <strong>Profil joueur</strong>
              <small>Bio et photo de profil</small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              +
            </span>
          </summary>
          <div className={styles.disclosureBody}>
            <form className={styles.form} onSubmit={(event) => void updateBio(event)}>
              <label>
                Votre bio
                <textarea
                  defaultValue={profile?.bio ?? ''}
                  disabled={!profile}
                  key={profile?.version ?? 0}
                  maxLength={280}
                  name="bio"
                  placeholder="Quelques mots sur votre façon de jouer…"
                  rows={4}
                />
                <small>{profile?.bio.length ?? 0}/280 caractères utilisés</small>
              </label>
              <button className={styles.primaryButton} disabled={!profile} type="submit">
                Enregistrer la bio
              </button>
            </form>
            <form className={styles.avatarForm} onSubmit={(event) => void uploadAvatar(event)}>
              <div>
                <strong>Photo de profil</strong>
                <p>PNG, JPEG ou WebP — 1 Mo maximum.</p>
              </div>
              <label className={styles.fileButton}>
                Choisir une image
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!profile}
                  name="avatar"
                  type="file"
                />
              </label>
              <button className={styles.secondaryButton} disabled={!profile} type="submit">
                Envoyer la photo
              </button>
              {profile?.hasAvatar ? (
                <button className={styles.textDangerButton} type="button" onClick={removeAvatar}>
                  Retirer la photo
                </button>
              ) : null}
            </form>
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary>
            <span className={styles.summaryIcon} aria-hidden="true">
              @
            </span>
            <span>
              <strong>Identité de connexion</strong>
              <small>@{session.user.username}</small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              +
            </span>
          </summary>
          <div className={styles.disclosureBody}>
            <form className={styles.form} onSubmit={(event) => void updateIdentity(event)}>
              <label>
                Nouveau pseudonyme
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  defaultValue={session.user.displayUsername}
                  maxLength={24}
                  minLength={3}
                  name="username"
                  pattern="[A-Za-z0-9_.]+"
                  required
                />
                <small>La casse d’affichage est conservée. Le pseudonyme reste unique.</small>
              </label>
              <button className={styles.primaryButton} type="submit">
                Modifier le pseudonyme
              </button>
            </form>
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary>
            <span className={styles.summaryIcon} aria-hidden="true">
              ✦
            </span>
            <span>
              <strong>Mot de passe et sécurité</strong>
              <small>Renouveler vos informations de connexion</small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              +
            </span>
          </summary>
          <div className={styles.disclosureBody}>
            <form className={styles.form} onSubmit={(event) => void changePassword(event)}>
              <label>
                Mot de passe actuel
                <input
                  autoComplete="current-password"
                  maxLength={128}
                  minLength={12}
                  name="currentPassword"
                  required
                  type="password"
                />
              </label>
              <label>
                Nouveau mot de passe
                <input
                  autoComplete="new-password"
                  maxLength={128}
                  minLength={12}
                  name="newPassword"
                  required
                  type="password"
                />
              </label>
              <button className={styles.primaryButton} type="submit">
                Modifier le mot de passe
              </button>
            </form>
          </div>
        </details>

        <details className={`${styles.disclosure} ${styles.dangerDisclosure}`}>
          <summary>
            <span className={styles.summaryIcon} aria-hidden="true">
              !
            </span>
            <span>
              <strong>Zone sensible</strong>
              <small>Suppression définitive du compte</small>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              +
            </span>
          </summary>
          <div className={styles.disclosureBody}>
            <form className={styles.deletionPanel} onSubmit={(event) => void deleteAccount(event)}>
              <p>
                Cette action supprimera le profil, les préférences et tous les résultats solo.
                Saisissez <strong>SUPPRIMER</strong> et votre mot de passe.
              </p>
              <label>
                Confirmation
                <input autoComplete="off" name="confirmation" pattern="SUPPRIMER" required />
              </label>
              <label>
                Mot de passe actuel
                <input
                  autoComplete="current-password"
                  maxLength={128}
                  minLength={12}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <button className={styles.dangerButton} type="submit">
                Supprimer définitivement
              </button>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}

function Avatar({
  client,
  profile,
  session,
}: {
  readonly client: ApiClient;
  readonly profile: PlayerProfile | null;
  readonly session: SessionSnapshot;
}) {
  return (
    <div className={styles.avatarFrame}>
      <div className={styles.avatar}>
        {profile?.hasAvatar ? (
          <img
            alt={`Avatar de ${session.user.displayUsername}`}
            key={profile.version}
            src={client.profileAvatarUrl(profile.version)}
          />
        ) : (
          <span aria-hidden="true">{session.user.displayUsername.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <span className={styles.avatarLevel}>JOUEUR</span>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

function StonesCard({ value }: { readonly value: number | undefined }) {
  return (
    <div className={styles.stonesStat}>
      <img src={stonesEmblem} alt="" aria-hidden="true" />
      <dt>Stones</dt>
      <dd>{value ?? '—'}</dd>
      <small>Votre valeur officielle en duel</small>
    </div>
  );
}

function HistoryCard({ result }: { readonly result: SoloGameResult }) {
  const victory = result.winner === 'human';
  return (
    <article className={styles.soloJournalCard}>
      <span className={victory ? styles.victoryMark : styles.defeatMark} aria-hidden="true">
        {victory ? 'V' : 'D'}
      </span>
      <span>
        <strong>{victory ? 'Victoire' : 'Défaite'}</strong>
        <small>{difficultyLabel(result.difficulty)} contre l’ordinateur</small>
      </span>
      <span>
        <strong>{result.roundsPlayed} manches</strong>
        <small>{formatGameDate(result.completedAt)}</small>
      </span>
    </article>
  );
}

function AccountTab({
  children,
  current,
  mode,
  onMode,
}: {
  readonly children: string;
  readonly current: AccountView;
  readonly mode: AccountView;
  readonly onMode: (mode: AccountView) => void;
}) {
  return (
    <button aria-selected={current === mode} role="tab" type="button" onClick={() => onMode(mode)}>
      {children}
    </button>
  );
}

function ModeButton({
  children,
  current,
  mode,
  onMode,
}: {
  readonly children: string;
  readonly current: AnonymousMode;
  readonly mode: AnonymousMode;
  readonly onMode: (mode: AnonymousMode) => void;
}) {
  return (
    <button aria-selected={current === mode} role="tab" type="button" onClick={() => onMode(mode)}>
      {children}
    </button>
  );
}

function StatusMessage({ message }: { readonly message: string }) {
  return (
    <p className={styles.message} role="status">
      {message}
    </p>
  );
}

async function loadOrCreateProfile(client: ApiClient): Promise<PlayerProfile> {
  try {
    return await client.getProfile();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      try {
        return await client.updateProfile({
          bio: '',
          expectedVersion: 0,
          nickname: 'Player',
        });
      } catch (creationError) {
        if (creationError instanceof ApiClientError && creationError.status === 409) {
          return client.getProfile();
        }
        throw creationError;
      }
    }
    throw error;
  }
}

function difficultyLabel(difficulty: SoloGameResult['difficulty']): string {
  if (difficulty === 'easy') return 'Découverte';
  if (difficulty === 'hard') return 'Experte';
  return 'Équilibrée';
}

function formatGameDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function toFrenchError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return 'Pseudonyme ou mot de passe incorrect.';
    }
    if (error.status === 409) {
      return 'Le profil a changé ailleurs. Rechargez la page puis réessayez.';
    }
    if (error.status === 429) {
      return 'Trop de tentatives. Réessayez dans quelques instants.';
    }
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}
