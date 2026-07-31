import type { Reaction, RoomSnapshot } from '@three-stone/protocol';

import type { UserPreferences } from '../settings/preferences.js';

type PlayerId = 'player-one' | 'player-two';
type ConnectionState = 'closed' | 'connected' | 'connecting' | 'disconnected';

export type RematchPresentation =
  | { readonly kind: 'declined'; readonly playerName: string }
  | { readonly kind: 'idle' }
  | { readonly kind: 'incoming'; readonly requesterName: string }
  | { readonly kind: 'waiting'; readonly opponentName: string };

export function statusMessage(
  snapshot: RoomSnapshot,
  ownHiddenChoice: number | undefined,
  localPlayerId: PlayerId,
): string {
  const opponentId = localPlayerId === 'player-one' ? 'player-two' : 'player-one';
  const opponentName = snapshot.players[opponentId].username;
  if (!snapshot.players[opponentId].connected) {
    return `${opponentName} se reconnecte…`;
  }
  if (!snapshot.ready['player-one'] || !snapshot.ready['player-two']) {
    return 'Les deux joueurs prennent place autour de la table…';
  }
  if (snapshot.phase === 'hidden-choices') {
    return ownHiddenChoice === undefined
      ? 'Choisissez secrètement les cailloux de votre main.'
      : 'Votre choix est verrouillé. La manche continue…';
  }
  if (snapshot.phase === 'first-prediction') {
    return snapshot.initiative === localPlayerId
      ? 'À vous d’annoncer la somme en premier.'
      : `${opponentName} doit annoncer la somme en premier.`;
  }
  if (snapshot.phase === 'second-prediction') {
    return snapshot.initiative === localPlayerId
      ? `${opponentName} prépare sa réponse.`
      : 'À vous de répondre avec une somme différente.';
  }
  if (snapshot.phase === 'cancelled') {
    return 'La partie a été annulée sans gagnant.';
  }
  return snapshot.winner === localPlayerId
    ? 'Vous avez remporté ce duel.'
    : `${opponentName} a remporté ce duel.`;
}

export function waitingConnectionMessage(connection: ConnectionState): string {
  switch (connection) {
    case 'connected':
      return 'Salon connecté. En attente de l’adversaire.';
    case 'connecting':
      return 'Connexion au salon en cours…';
    case 'disconnected':
      return 'Connexion interrompue. Tentative de reconnexion…';
    case 'closed':
      return 'Le salon est fermé.';
  }
}

export function pregameWaitingMessage(snapshot: RoomSnapshot, localPlayerId: PlayerId): string {
  const opponentId = localPlayerId === 'player-one' ? 'player-two' : 'player-one';
  const opponent = snapshot.players[opponentId];
  if (!opponent.connected) {
    return `${opponent.username} se reconnecte… Le duel commencera à son retour.`;
  }
  return 'Les deux joueurs prennent place autour de la table…';
}

export function networkErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    MESSAGE_INVALID: 'Une réponse réseau invalide a été écartée.',
    NOT_YOUR_TURN: 'Ce n’est pas encore votre tour.',
    RATE_LIMITED: 'Laissez passer un instant avant une nouvelle réaction.',
    ROOM_UNAVAILABLE: 'Ce salon n’est plus disponible.',
    VALUE_INVALID: 'Ce choix n’est pas autorisé.',
    WRONG_PHASE: 'Cette action arrive trop tard pour cette phase.',
  };
  return messages[error] ?? 'La commande n’a pas pu être appliquée.';
}

export function reactionLabel(reaction: Reaction): string {
  const labels: Record<Reaction, string> = {
    'well-played': 'Bien joué !',
    'nice-bluff': 'Joli bluff !',
    oops: 'Oups !',
    rematch: 'Revanche ?',
  };
  return labels[reaction];
}

export function remainingSeconds(
  deadline: number | null,
  estimatedServerNow: number,
): number | null {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - estimatedServerNow) / 1_000));
}

export function rematchPresentation(
  snapshot: RoomSnapshot,
  localPlayerId: PlayerId,
): RematchPresentation {
  const opponentId = localPlayerId === 'player-one' ? 'player-two' : 'player-one';
  if (snapshot.rematch.declinedBy !== null) {
    return {
      kind: 'declined',
      playerName: snapshot.players[snapshot.rematch.declinedBy].username,
    };
  }
  if (snapshot.rematch.accepted[opponentId] && !snapshot.rematch.accepted[localPlayerId]) {
    return { kind: 'incoming', requesterName: snapshot.players[opponentId].username };
  }
  if (snapshot.rematch.accepted[localPlayerId]) {
    return { kind: 'waiting', opponentName: snapshot.players[opponentId].username };
  }
  return { kind: 'idle' };
}

export function playerInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('fr-FR') ?? 'J';
}

export function shouldReduceMotion(preferences: UserPreferences): boolean {
  return (
    preferences.motion === 'reduced' ||
    (preferences.motion === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
