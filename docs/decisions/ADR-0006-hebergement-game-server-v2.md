# ADR-0006 — Hébergement du serveur de jeu v2

- Statut : accepté
- Date : 2026-07-30
- Version cible : v2
- Décision locale : aucun déploiement avant validation explicite du propriétaire

## Contexte

La v2 nécessite un processus Node long vivant capable de conserver les salles
Colyseus en mémoire et d’accepter des connexions WebSocket. Le client et l’API
v1 restent sur Vercel, et les données durables restent dans PostgreSQL Neon en
Europe.

Une fonction Vercel n’est pas retenue comme autorité initiale de la partie.
Vercel prend désormais en charge les WebSockets, mais une connexion reste liée
à la durée maximale de sa fonction et une reconnexion n’est pas garantie de
retrouver le même processus. Ce modèle ne convient pas encore aux salons
Colyseus conservés en mémoire par la v2, qui recherche une topologie simple et
prévisible sans état distribué.

Render documente les Web Services Node long vivants, les connexions WebSocket,
le TLS managé, les domaines personnalisés, les signaux d’arrêt et les
connexions sans durée maximale imposée :

- [Web Services Render](https://render.com/docs/web-services) ;
- [WebSockets sur Render](https://render.com/docs/websocket) ;
- [limites des instances gratuites](https://render.com/docs/free) ;
- [déploiement Colyseus](https://docs.colyseus.io/deployment).

## Décision

- `apps/game-server` sera préparé pour un **Web Service Render** dans une région
  européenne proche de PostgreSQL.
- La production utilisera une instance payante toujours active. Une instance
  gratuite peut servir à une preview manuelle, jamais à la production : elle
  peut s’endormir après quinze minutes sans trafic entrant et redémarrer.
- Le service écoute `0.0.0.0:$PORT`, expose HTTPS/WSS via le TLS Render et
  fournit `/health/live` et `/health/ready`.
- La v2 commence sur exactement une instance. L’équilibrage multi-instance,
  Redis et la reprise de salle sur un autre processus restent hors périmètre.
- Vercel continue de servir le web et Hono. Les appels API → game-server passent
  par HTTPS sur un endpoint interne authentifié avec un secret distinct du
  ticket joueur.
- Les tickets d’admission sont signés par un secret partagé distinct. Les
  secrets de production sont injectés dans Vercel et Render, jamais suivis par
  Git.
- Le navigateur reçoit l’URL WSS par `VITE_GAME_SERVER_URL`. Aucun ticket ou
  code de salon n’est placé dans cette URL.
- Le game-server accède à Neon avec TLS et un pool borné. Les migrations restent
  une opération explicite exécutée avant l’ouverture des nouveaux salons.
- Le service envoie des pings WebSocket et limite la taille des messages.

## Déploiement et drainage

Une release déclenche d’abord le mode drainage par un endpoint administratif :

1. refuser toute création ou jonction de salon ;
2. prévenir les salons actifs et attendre au plus dix minutes ;
3. annuler sans résultat les salons restants ;
4. confirmer qu’aucun salon n’est actif ;
5. seulement alors demander le déploiement Render.

Render peut envoyer `SIGTERM` lors d’une maintenance ou d’un remplacement
d’instance. Le serveur cesse immédiatement les admissions, ferme les
connexions avec une cause générique et n’invente jamais de gagnant. Le délai
d’arrêt Render est configuré au maximum disponible, mais ne remplace pas le
drainage applicatif préalable.

## Retour arrière

- Le client N et le serveur N-1 doivent soit partager le protocole `2.0`, soit
  refuser explicitement la connexion.
- Un retour arrière réactive uniquement une version compatible avec les
  migrations déjà appliquées.
- Les nouvelles admissions restent fermées pendant le retour arrière.
- Les baux orphelins expirent automatiquement ; aucun résultat de partie active
  perdue n’est créé.

## Conséquences

- Le coût initial inclut un petit service toujours actif, mais évite le
  cold-start d’une instance gratuite et simplifie le modèle mémoire.
- Une maintenance Render peut interrompre les salons ; la reconnexion directe
  ne garantit pas une reprise après remplacement de l’unique instance.
- Une montée à plusieurs instances exigera une nouvelle décision sur
  l’affinité, la présence distribuée et l’état de reprise.
- La création ou la modification d’un service Render reste une opération de
  livraison explicitement validée par le propriétaire du projet.
