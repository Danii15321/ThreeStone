import type { RoomSnapshot } from '@three-stone/protocol';

import type { UserPreferences } from '../settings/preferences.js';

type PlayerId = 'player-one' | 'player-two';

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

export function networkErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    MESSAGE_INVALID: 'Une réponse réseau invalide a été écartée.',
    NOT_YOUR_TURN: 'Ce n’est pas encore votre tour.',
    ROOM_UNAVAILABLE: 'Ce salon n’est plus disponible.',
    VALUE_INVALID: 'Ce choix n’est pas autorisé.',
    WRONG_PHASE: 'Cette action arrive trop tard pour cette phase.',
  };
  return messages[error] ?? 'La commande n’a pas pu être appliquée.';
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
