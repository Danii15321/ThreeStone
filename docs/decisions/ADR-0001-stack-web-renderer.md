# ADR-0001 — Stack web et renderer

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1

## Contexte

La v1 doit proposer une interface responsive et accessible, tout en présentant
un plateau 2.5D animé. Le moteur de règles doit rester indépendant du
navigateur et du renderer. Le dépôt scaffoldé utilise déjà TypeScript, React,
Vite, Phaser, Hono et pnpm.

## Options étudiées

1. React et DOM uniquement, y compris pour le plateau.
2. React pour l'application et Phaser pour la présentation du plateau.
3. Un moteur 3D complet tel que Three.js ou Babylon.js.
4. Un framework full-stack avec rendu serveur.

## Décision

La v1 conserve :

- TypeScript strict dans un monorepo pnpm ;
- React et le DOM pour le shell, les formulaires, les contrôles, les annonces et
  toute information indispensable ;
- Vite pour le développement, le découpage et le build du client ;
- Phaser chargé à la demande pour le plateau, les sprites, les animations et
  l'audio ;
- CSS Modules et variables CSS pour les composants et les tokens.

Phaser est un adaptateur de présentation. Il reçoit des instructions issues
d'événements déjà confirmés et ne déclenche aucune transition métier. Le jeu
reste entièrement utilisable au clavier à travers des contrôles DOM. Une
alternative textuelle expose l'état utile du plateau.

La scène 3D, le rendu serveur et l'introduction d'un second framework
d'interface sont hors périmètre v1. Les budgets mesurables associés sont fixés
par [`ADR-0011`](./ADR-0011-budgets-visuels-performance.md).

## Conséquences

- Le moteur et l'IA sont testables sans navigateur.
- Le bundle initial ne charge pas Phaser avant l'entrée dans une partie.
- React ne rerend pas à chaque frame Phaser.
- Les animations peuvent être passées ou réduites sans modifier l'état.
- Les assets doivent avoir une provenance et une licence documentées.
- Une dégradation sans WebGL conserve les contrôles et l'état textuel ; Canvas
  2D est utilisé si Phaser le permet, sinon le plateau décoratif est remplacé
  par la vue DOM.

## Critères de réexamen

Cette décision n'est réouverte que si des tests utilisateurs montrent que la
2.5D n'atteint pas l'intention produit, ou si les budgets de l'ADR-0011 ne
peuvent pas être tenus après deux itérations mesurées.
