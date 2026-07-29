# Migrations PostgreSQL

`0000_clever_korvac.sql` crée le schéma v1 initial :

- tables Better Auth `user`, `session`, `account` et `verification` ;
- profil et préférences du joueur ;
- résultat terminal et participants d’une partie solo ;
- clés étrangères avec suppression en cascade, index et contraintes de bornes.

`0001_lean_radioactive_man.sql` ajoute la version optimiste du profil et retire
une borne en nombre de points de code qui ne représentait pas correctement la
limite produit en graphèmes. La validation exacte reste portée par le contrat
Unicode partagé.

## Déploiement

1. Sauvegarder la base cible et vérifier que la restauration est possible.
2. Exécuter `pnpm db:migrate` avec `DATABASE_URL` pointant explicitement vers la
   base cible.
3. Vérifier `/api/health/ready`.
4. Exécuter les parcours d’inscription, session, profil et résultat idempotent.

La migration initiale est additive sur une base vide. Elle a été appliquée à
une instance PostgreSQL réelle isolée, puis testée avec les repositories et
Better Auth.

## Retour arrière

Il n’existe pas de migration descendante automatique : supprimer les tables
d’identité ou de résultat détruirait des données. Avant toute donnée réelle, un
retour arrière peut supprimer le schéma vide. Après ouverture aux utilisateurs,
revenir à la sauvegarde prise avant migration ou déployer une migration
corrective compatible.

Les futures modifications destructrices suivront
`expand → migrate/backfill → contract`, sur plusieurs livraisons.
