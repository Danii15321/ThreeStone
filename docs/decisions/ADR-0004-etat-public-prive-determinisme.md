# ADR-0004 — État public, observations privées et déterminisme

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1, réutilisable en v2

## Contexte

Le bluff dépend de choix cachés. Le moteur solo s'exécute dans le navigateur,
mais l'IA ne doit pas recevoir le secret humain. Le futur serveur v2 doit
réutiliser le moteur sans exposer son état interne.

## Options étudiées

1. Exposer un état unique puis demander aux adaptateurs d'ignorer les secrets.
2. Maintenir un état interne et produire explicitement une vue publique et une
   observation privée par siège.
3. Stocker les choix cachés dans React ou Phaser.

## Décision

Le package `game-core` possède trois modèles distincts :

1. l'état interne, contenant les deux choix ;
2. la vue publique, ne contenant aucun choix avant la révélation ;
3. l'observation privée d'un siège, ajoutant uniquement son propre choix et ses
   actions légales.

L'IA accepte exclusivement une observation privée, une liste d'actions légales,
une stratégie et un générateur pseudo-aléatoire injecté. Son API ne peut pas
recevoir l'état interne.

Une action est validée par le moteur et renvoie sans exception attendue soit une
erreur de domaine sans mutation, soit un nouvel état immuable et des événements
ordonnés. Avant révélation, l'événement public d'un choix indique seulement que
le siège est prêt. Les deux valeurs apparaissent ensemble dans l'événement de
révélation.

Le moteur ne lit ni l'heure système, ni `Math.random`, ni le framerate. Une
partie reçoit `gameId`, version de règles, graine et premier annonçant. À version,
état initial et suite d'actions identiques, l'état et les événements sont
identiques.

Le replay interne peut conserver les actions secrètes dans un contexte protégé,
mais aucune journalisation v1 ne les persiste ou ne les transmet. La v1 ne
stocke que le résultat terminal.

## Conséquences

- Des tests de forme échouent si un champ secret apparaît dans une vue publique
  ou l'observation adverse.
- Le contrôleur React/Phaser ne conserve qu'une vue de présentation.
- Les erreurs, logs et métriques ne sérialisent jamais l'état interne.
- La transition de révélation et résolution peut être atomique tout en émettant
  des événements distincts pour les animations.
- Le protocole v2 devra construire ses messages à partir des projections, pas
  filtrer tardivement un état sérialisé.
