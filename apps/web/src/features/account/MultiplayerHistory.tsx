import type { MultiplayerGameSummary } from '@three-stone/api-contracts';

import styles from './AccountPanel.module.css';

export function MultiplayerHistoryCard({ game }: { readonly game: MultiplayerGameSummary }) {
  const opponentSeat = game.localSeat === 'player-one' ? 'player-two' : 'player-one';
  const local = game.participants[game.localSeat];
  const opponent = game.participants[opponentSeat];
  const delta = local.stonesDelta;

  return (
    <details className={styles.transcriptCard}>
      <summary>
        <span className={local.outcome === 'win' ? styles.victoryMark : styles.defeatMark}>
          {local.outcome === 'win' ? 'V' : 'D'}
        </span>
        <span className={styles.journalIdentity}>
          <strong>{local.outcome === 'win' ? 'Victoire' : 'Défaite'}</strong>
          <small>Duel privé contre {opponent.displayName}</small>
        </span>
        <span className={delta >= 0 ? styles.stonesGain : styles.stonesLoss}>
          {delta >= 0 ? '+' : ''}
          {delta} Stones
        </span>
        <span>
          {game.rounds.length} manche{game.rounds.length > 1 ? 's' : ''}
          <small>{formatGameDate(game.completedAt)}</small>
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
              Annonces {round.predictions[game.localSeat]} / {round.predictions[opponentSeat]}
            </small>
          </li>
        ))}
      </ol>
      <p className={styles.transcriptMeta}>
        Stones {local.stonesBefore} → {local.stonesAfter}
        {' · '}règles {game.rulesVersion}
      </p>
    </details>
  );
}

function formatGameDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}
