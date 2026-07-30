import type { MultiplayerGameHistory } from '@three-stone/api-contracts';

import styles from './AccountPanel.module.css';

export function MultiplayerHistory({
  history,
}: {
  readonly history: MultiplayerGameHistory | null;
}) {
  return (
    <section className={styles.history} aria-labelledby="multiplayer-history-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Duels privés</p>
          <h2 id="multiplayer-history-title">Historique multijoueur</h2>
        </div>
        <span>{history?.total ?? 0} au total</span>
      </div>
      {history && history.items.length > 0 ? (
        <div className={styles.transcriptList}>
          {history.items.map((game) => {
            const opponentSeat = game.localSeat === 'player-one' ? 'player-two' : 'player-one';
            const local = game.participants[game.localSeat];
            const opponent = game.participants[opponentSeat];
            return (
              <details className={styles.transcriptCard} key={game.gameId}>
                <summary>
                  <span>
                    <strong>{local.outcome === 'win' ? 'Victoire' : 'Défaite'}</strong>
                    <small>contre {opponent.displayName}</small>
                  </span>
                  <span>
                    {game.rounds.length} manche{game.rounds.length > 1 ? 's' : ''}
                  </span>
                </summary>
                <ol>
                  {game.rounds.map((round) => (
                    <li key={round.roundNumber}>
                      <span>Manche {round.roundNumber}</span>
                      <span>
                        {round.choices[game.localSeat]} + {round.choices[opponentSeat]} ={' '}
                        <strong>{round.total}</strong>
                      </span>
                      <small>
                        Annonces {round.predictions[game.localSeat]} /{' '}
                        {round.predictions[opponentSeat]}
                      </small>
                    </li>
                  ))}
                </ol>
                <p className={styles.transcriptMeta}>
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(game.completedAt))}
                  {' · '}règles {game.rulesVersion}
                </p>
              </details>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyHistory}>
          <span aria-hidden="true">◇</span>
          <p>Aucun duel multijoueur enregistré pour le moment.</p>
        </div>
      )}
    </section>
  );
}
