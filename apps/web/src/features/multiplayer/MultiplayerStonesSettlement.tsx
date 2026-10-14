import type { RoomSnapshot } from '@three-stone/protocol';

import stoneEye from '../../assets/reward-stone-eye.webp';
import stoneHand from '../../assets/reward-stone-hand.webp';
import stoneHeart from '../../assets/reward-stone-heart.webp';
import {
  stonesSettlementPresentation,
  type StonesRewardPresentation,
} from './multiplayer-presentation.js';
import styles from './MultiplayerStones.module.css';

const rewardIcons: Readonly<Record<StonesRewardPresentation['kind'], string>> = {
  'stone-eye': stoneEye,
  'stone-hand': stoneHand,
  'stone-heart': stoneHeart,
};

export function MultiplayerStonesSettlement({ snapshot }: { readonly snapshot: RoomSnapshot }) {
  const players = stonesSettlementPresentation(snapshot);
  if (snapshot.stonesSettlement === null) {
    return (
      <div className={styles.settlementPending} role="status">
        Le serveur scelle le bilan des Stones…
      </div>
    );
  }

  return (
    <section className={styles.settlement} aria-labelledby="stones-settlement-title">
      <header className={styles.settlementHeader}>
        <div>
          <p>Valeur du duel</p>
          <h3 id="stones-settlement-title">Évolution des Stones</h3>
        </div>
        <span data-rated={snapshot.stonesSettlement.rated}>
          {snapshot.stonesSettlement.rated ? 'Duel classé' : 'Duel amical'}
        </span>
      </header>

      {!snapshot.stonesSettlement.rated ? (
        <p className={styles.unratedNotice}>
          La limite de cinq duels classés entre ces deux joueurs sur 24 h est atteinte. Aucun Stone
          ni bonus n’est attribué.
        </p>
      ) : null}

      <div className={styles.settlementGrid}>
        {players.map((player) => (
          <article className={styles.settlementCard} key={player.playerId}>
            <div className={styles.settlementIdentity}>
              <div className={styles.classSeal} data-stone-class={player.stoneClass}>
                <span>Classe</span>
                <strong>{player.stoneClass}</strong>
              </div>
              <div>
                <h4>{player.username}</h4>
                <p>
                  {player.stonesBefore} <span aria-hidden="true">→</span>{' '}
                  <strong>{player.stonesAfter} Stones</strong>
                </p>
              </div>
              <strong className={styles.netDelta} data-positive={player.netDelta >= 0}>
                {formatDelta(player.netDelta)}
              </strong>
            </div>

            <p className={styles.baseDelta}>
              Résultat du duel : <strong>{formatDelta(player.baseDelta)}</strong>
            </p>

            {player.rewards.length > 0 ? (
              <ul className={styles.rewardList} aria-label={`Récompenses de ${player.username}`}>
                {player.rewards.map((reward) => (
                  <li key={reward.kind}>
                    <img src={rewardIcons[reward.kind]} alt="" aria-hidden="true" />
                    <span>
                      <strong>{reward.label}</strong>
                      {reward.occurrences > 1 ? <small>× {reward.occurrences}</small> : null}
                    </span>
                    <b>+{reward.stones}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.noReward}>Aucun artefact de pierre obtenu.</p>
            )}

            {player.classChanged ? (
              <p className={styles.classChange}>Nouvelle classe atteinte : {player.stoneClass}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value} Stones`;
}
