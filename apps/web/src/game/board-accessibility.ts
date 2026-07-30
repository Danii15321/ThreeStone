import type { BoardModel } from './board-model.js';

export function describeBoard(
  model: BoardModel,
  playerName = 'vous',
  opponentName = "l'ordinateur",
): string {
  return `Plateau de jeu. ${describePose(model, playerName, opponentName)} ${playerName} a ${stoneCount(
    model.human.reserve,
  )}, ${opponentName} en a ${model.ai.reserve}.`;
}

function describePose(model: BoardModel, playerName: string, opponentName: string): string {
  if (model.pose === 'closed') {
    return 'Les deux mains sont fermées.';
  }
  if (model.pose === 'human-victory') {
    return `${playerName} célèbre sa victoire avec un pouce levé.`;
  }
  if (model.pose === 'ai-victory') {
    return `${opponentName} célèbre sa victoire avec un pouce levé.`;
  }
  return `Les mains sont ouvertes : ${stoneCount(
    model.ai.revealedCount,
  )} pour ${opponentName} et ${model.human.revealedCount} pour ${playerName}.`;
}

function stoneCount(count: number): string {
  return `${count} caillou${count > 1 ? 'x' : ''}`;
}
