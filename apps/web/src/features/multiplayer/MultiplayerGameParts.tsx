import type { RoomSnapshot } from '@three-stone/protocol';

import gameStyles from '../solo-game/GameScreen.module.css';
import { stoneReserveLabel } from './multiplayer-view-model.js';
import {
  networkErrorMessage,
  playerInitial,
  pregameWaitingMessage,
  waitingConnectionMessage,
} from './multiplayer-presentation.js';
import lobbyStyles from './MultiplayerLobby.module.css';

type PlayerId = 'player-one' | 'player-two';

export function WaitingRoom({
  connection,
  error,
  inviteCode,
  onExit,
}: {
  readonly connection: 'closed' | 'connected' | 'connecting' | 'disconnected';
  readonly error: string | null;
  readonly inviteCode: string | null;
  readonly onExit: () => void;
}) {
  const connected = connection === 'connected';
  return (
    <main className={lobbyStyles.shell}>
      <header className={lobbyStyles.topbar}>
        <div>
          <p className={lobbyStyles.eyebrow}>Salon privé</p>
          <h1>ThreeStone</h1>
        </div>
        <button className={lobbyStyles.secondaryButton} type="button" onClick={onExit}>
          Quitter le salon
        </button>
      </header>
      <section className={lobbyStyles.panel} aria-labelledby="waiting-title">
        <p className={lobbyStyles.eyebrow}>Votre table est prête</p>
        <h2 id="waiting-title">
          {connected ? 'En attente de l’adversaire' : 'Reconnexion au salon'}
        </h2>
        <div className={lobbyStyles.waiting} role="status" aria-live="polite">
          <span className={lobbyStyles.pulse} aria-hidden="true" />
          <p className={lobbyStyles.panelText}>{waitingConnectionMessage(connection)}</p>
          {inviteCode ? (
            <>
              <p className={lobbyStyles.panelText}>
                Transmettez ce code privé à la personne que vous souhaitez défier.
              </p>
              <strong className={lobbyStyles.inviteCode}>{inviteCode}</strong>
            </>
          ) : null}
        </div>
        {error ? <p className={lobbyStyles.error}>{networkErrorMessage(error)}</p> : null}
      </section>
    </main>
  );
}

export function PlayersWaitingRoom({
  error,
  localPlayerId,
  onExit,
  snapshot,
}: {
  readonly error: string | null;
  readonly localPlayerId: PlayerId;
  readonly onExit: () => void;
  readonly snapshot: RoomSnapshot;
}) {
  return (
    <main className={lobbyStyles.shell}>
      <header className={lobbyStyles.topbar}>
        <div>
          <p className={lobbyStyles.eyebrow}>Salon privé</p>
          <h1>ThreeStone</h1>
        </div>
        <button className={lobbyStyles.secondaryButton} type="button" onClick={onExit}>
          Quitter le salon
        </button>
      </header>
      <section className={lobbyStyles.panel} aria-labelledby="players-waiting-title">
        <p className={lobbyStyles.eyebrow}>Les deux sièges sont réservés</p>
        <h2 id="players-waiting-title">Le duel va commencer</h2>
        <div className={lobbyStyles.playerWaitingGrid}>
          {(['player-one', 'player-two'] as const).map((playerId) => {
            const player = snapshot.players[playerId];
            return (
              <article className={lobbyStyles.playerWaitingCard} key={playerId}>
                <div className={lobbyStyles.waitingAvatar}>
                  {player.avatarUrl ? (
                    <img alt={`Avatar de ${player.username}`} src={player.avatarUrl} />
                  ) : (
                    <span aria-hidden="true">{playerInitial(player.username)}</span>
                  )}
                </div>
                <strong>{player.username}</strong>
                <span data-connected={player.connected}>
                  {player.connected
                    ? snapshot.ready[playerId]
                      ? 'Prêt'
                      : 'À la table'
                    : 'Reconnexion…'}
                </span>
              </article>
            );
          })}
        </div>
        <div className={lobbyStyles.waiting} role="status" aria-live="polite">
          <span className={lobbyStyles.pulse} aria-hidden="true" />
          <p className={lobbyStyles.panelText}>{pregameWaitingMessage(snapshot, localPlayerId)}</p>
        </div>
        {error ? <p className={lobbyStyles.error}>{networkErrorMessage(error)}</p> : null}
      </section>
    </main>
  );
}

export function PlayerCard({
  avatarUrl,
  connected,
  initiative,
  name,
  prediction,
  reserve,
  side,
  winner,
}: {
  readonly avatarUrl?: string | null | undefined;
  readonly connected: boolean;
  readonly initiative: boolean;
  readonly name: string;
  readonly prediction: number | null;
  readonly reserve: number;
  readonly side: 'left' | 'right';
  readonly winner: boolean;
}) {
  return (
    <section
      aria-label={`${name}, ${connected ? 'connecté' : 'déconnecté'}`}
      className={`${gameStyles.playerProfile} ${
        side === 'right' ? gameStyles.humanProfile : gameStyles.aiProfile
      } ${winner ? gameStyles.winnerProfile : ''}`}
      data-side={side}
    >
      <div className={gameStyles.identity}>
        {winner ? (
          <span
            aria-label={`Couronne de victoire de ${name}`}
            className={gameStyles.winnerCrown}
            role="img"
          >
            ♛
          </span>
        ) : null}
        <div className={gameStyles.avatar}>
          {avatarUrl ? (
            <img alt={`Avatar de ${name}`} src={avatarUrl} />
          ) : (
            <span aria-hidden="true">{playerInitial(name)}</span>
          )}
        </div>
        <strong>{name}</strong>
        <div className={gameStyles.reserve} aria-label={stoneReserveLabel(reserve)}>
          <span className={gameStyles.miniStones} aria-hidden="true">
            {Array.from({ length: reserve }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span>
            {reserve} caillou{reserve > 1 ? 'x' : ''}
          </span>
        </div>
        {initiative ? <span className={gameStyles.initiative}>Annonce en premier</span> : null}
      </div>
      {prediction !== null ? (
        <p className={gameStyles.predictionBubble}>
          La somme sera <strong>{prediction}</strong>
        </p>
      ) : null}
    </section>
  );
}

export function StonePicker({
  onConfirm,
  onToggle,
  reserve,
  selected,
}: {
  readonly onConfirm: () => void;
  readonly onToggle: (index: number) => void;
  readonly reserve: number;
  readonly selected: ReadonlySet<number>;
}) {
  return (
    <fieldset className={gameStyles.controlPanel}>
      <legend>Choisissez vos cailloux</legend>
      <p className={gameStyles.controlHint}>
        Sélectionnez les cailloux à cacher. Aucun choix signifie zéro.
      </p>
      <div className={gameStyles.stonePicker}>
        {Array.from({ length: reserve }, (_, index) => (
          <button
            aria-label={`Caillou ${index + 1}`}
            aria-pressed={selected.has(index)}
            className={gameStyles.selectableStone}
            key={index}
            type="button"
            onClick={() => onToggle(index)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className={gameStyles.controlFooter}>
        <p>
          <strong>{selected.size}</strong> sélectionné{selected.size > 1 ? 's' : ''}
        </p>
        <button className={gameStyles.primaryButton} type="button" onClick={onConfirm}>
          Valider mon choix · {selected.size}
        </button>
      </div>
    </fieldset>
  );
}

export function PredictionSlider({
  forbiddenValue,
  onChange,
  onConfirm,
  value,
}: {
  readonly forbiddenValue: number | null;
  readonly onChange: (value: number) => number;
  readonly onConfirm: () => void;
  readonly value: number;
}) {
  return (
    <fieldset className={gameStyles.controlPanel}>
      <legend>Faites votre pronostic</legend>
      <div className={gameStyles.sliderHeader}>
        <p className={gameStyles.controlHint}>Quelle sera la somme des deux mains ?</p>
        <output htmlFor="multiplayer-prediction-slider">{value}</output>
      </div>
      <input
        aria-label="Votre pronostic"
        aria-valuetext={`${value}, somme annoncée`}
        id="multiplayer-prediction-slider"
        max="6"
        min="0"
        step="1"
        type="range"
        value={value}
        onChange={(event) => {
          event.currentTarget.value = String(onChange(Number(event.currentTarget.value)));
        }}
      />
      <div className={gameStyles.sliderTicks} aria-hidden="true">
        {Array.from({ length: 7 }, (_, tick) => (
          <span
            className={tick === forbiddenValue ? gameStyles.forbiddenTick : undefined}
            key={tick}
          >
            {tick}
          </span>
        ))}
      </div>
      <div className={gameStyles.controlFooter}>
        <p>
          {forbiddenValue === null
            ? 'Vous ouvrez les annonces.'
            : `Le ${forbiddenValue} est déjà annoncé.`}
        </p>
        <button className={gameStyles.primaryButton} type="button" onClick={onConfirm}>
          Annoncer {value}
        </button>
      </div>
    </fieldset>
  );
}
