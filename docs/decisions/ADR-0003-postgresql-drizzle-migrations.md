# ADR-0003 — PostgreSQL, Drizzle et migrations

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1

## Contexte

Les identités, sessions, profils, préférences et résultats terminés exigent une
persistance relationnelle transactionnelle, réutilisable en v2. Les changements
de schéma doivent être explicites, testés et restaurables.

## Options étudiées

1. PostgreSQL avec Drizzle et migrations SQL versionnées.
2. SQLite en v1 puis migration vers PostgreSQL.
3. Requêtes SQL dispersées dans l'API.
4. Migrations appliquées automatiquement au démarrage de chaque instance.

## Décision

- PostgreSQL 17 est la base de référence locale, CI, staging et production.
- Drizzle définit le schéma applicatif et les repositories. Les tables Better
  Auth suivent les migrations produites ou documentées par Better Auth.
- Chaque migration SQL générée est relue et commitée ; le schéma ne change
  jamais implicitement au démarrage de l'API.
- Un job de release unique applique les migrations avant le déploiement de
  l'application compatible. Plusieurs instances ne migrent jamais en parallèle.
- Chaque changement est testé depuis une base vide et depuis le dernier schéma
  publié avec des données représentatives non personnelles.
- Les changements destructeurs suivent `expand → migrate → contract` sur au
  moins deux livraisons. Un déploiement applicatif reste compatible avec les
  deux formes pendant la transition.
- Une sauvegarde et un test de restauration précèdent toute migration
  irréversible. Le rollback normal consiste à redéployer l'application
  précédente compatible ; restaurer la base entière est un dernier recours
  documenté.
- Les résultats, participants et projection statistique sont écrits dans une
  transaction. `gameId` est unique.
- Réécrire le même résultat avec le même contenu est un succès idempotent.
  Réutiliser le même identifiant avec un contenu différent est un conflit sans
  mutation.
- Les lignes Drizzle sont mappées vers des modèles applicatifs puis des DTO
  validés. Aucun handler HTTP n'exécute directement une requête.

## Sauvegarde et compatibilité

- Production : sauvegarde quotidienne chiffrée, conservation 14 jours et
  restauration répétée avant la première release puis au minimum
  trimestriellement.
- Staging et test utilisent des bases et secrets distincts.
- La connexion production exige TLS et un compte d'application sans privilège
  de création de base ou de rôle.
- Les timeouts de connexion, requête et transaction sont bornés ; le pool est
  dimensionné avec la capacité PostgreSQL, pas par défaut implicite.

## Conséquences

- Le pipeline doit démarrer PostgreSQL pour les tests d'intégration et de
  migration.
- Une migration ne peut pas être déclarée livrable sans preuve zéro, N-1 et
  restauration.
- SQLite et une base en mémoire ne sont pas des substituts valides aux tests
  d'intégration.
- Redis et l'écriture des manches en cours restent hors périmètre v1.
