# ADR-0010 — Topologie de déploiement v1

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1

## Contexte

Les cookies de session, CORS et CSRF sont plus simples et plus sûrs sous une
origine publique unique. La v1 n'a ni temps réel, ni besoin
multi-région démontré.

## Options étudiées

1. Client, API et base chez un fournisseur intégré.
2. Assets statiques et API séparés sur des domaines différents.
3. Origine unique derrière un reverse proxy, services déployables séparément.

## Décision

La production utilise une origine HTTPS unique :

- `/` et les routes SPA servent des fichiers statiques immuables depuis un
  stockage/CDN ;
- `/api/*` est routé vers une application Node.js/Hono conteneurisée ;
- PostgreSQL est un service managé privé, chiffré en transit et au repos ;
- le reverse proxy termine TLS, applique HSTS et ne met jamais en cache les
  réponses authentifiées.

L'API est sans état local durable. Une instance suffit au lancement, mais aucun
choix ne bloque un passage horizontal ultérieur. Les sessions restent en
PostgreSQL. Il n'y a ni Redis, ni Colyseus, ni stockage d'uploads en v1.

Les artefacts sont :

- un build web versionné, promu sans reconstruction entre staging et
  production ;
- une image OCI de l'API épinglée par digest ;
- des migrations SQL versionnées appliquées par un job unique.

Local utilise Docker Compose pour PostgreSQL, tandis que web et API peuvent
tourner avec `pnpm dev`. La CI utilise PostgreSQL éphémère. Staging reproduit la
topologie production avec données fictives, base, origine et secrets distincts.

## Séquence de livraison

1. construire et vérifier les artefacts ;
2. sauvegarder PostgreSQL et prouver la restauration requise ;
3. appliquer les migrations compatibles ;
4. déployer l'API et attendre readiness ;
5. publier les assets web ;
6. exécuter liveness, readiness et smoke tests de compte et de partie ;
7. surveiller taux d'erreur, latence, pool DB et échecs d’authentification ;
8. poursuivre ou redéployer les artefacts précédents selon les seuils.

Le rollback ne supprime pas une colonne introduite. L'application précédente
doit rester compatible avec le schéma étendu. Les secrets sont injectés par la
plateforme, ont un propriétaire et une procédure de rotation.

## Disponibilité et exploitation

- Liveness vérifie le processus ; readiness vérifie les dépendances nécessaires.
- L'arrêt retire readiness, refuse les nouvelles requêtes, termine les requêtes
  en cours avec une limite puis ferme le pool.
- Les logs JSON vont sur la sortie standard avec corrélation et redaction.
- Aucun objectif multi-région ou disponibilité 24/7 contractuelle n'est promis
  en v1 ; la priorité est un rollback fiable et une restauration prouvée.

## Conséquences

- Les cookies restent same-site et CORS peut être fermé à l'origine publique.
- Le nom de domaine, la région et le fournisseur d'hébergement restent des
  paramètres d'exploitation, sous réserve du contrat de données de l'ADR-0005.
