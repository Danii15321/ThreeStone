# ADR-0013 — Profil, bio et avatar v1

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1

## Contexte

Le compte doit devenir un espace de joueur, et non une restitution brute de
données. La v1 doit afficher une identité visuelle, une courte présentation et
les performances solo, tout en préparant un futur profil visible par d’autres
joueurs. Le projet ne dispose pas encore d’un stockage objet.

## Décision

- La page de compte sépare **Profil** et **Confidentialité**.
- Le profil affiche une bannière stylisée, l’avatar, la bio, les statistiques,
  les dernières parties et la déconnexion.
- La confidentialité regroupe les modifications dans des panneaux repliables :
  bio/avatar, pseudonyme, mot de passe et suppression.
- La bio contient au plus 280 caractères et partage la version optimiste du
  profil.
- L’avatar accepte JPEG, PNG et WebP, avec une taille maximale de 1 Mio. L’API
  vérifie le type déclaré et la signature binaire.
- Pour la v1, le contenu encodé en base64 et son type MIME sont stockés dans
  `player_profile`. La lecture est authentifiée et réservée au propriétaire.
- L’avatar est supprimé en cascade avec le compte.
- L’interface ne présente pas de commande d’export. L’API d’export existante
  reste indépendante de cette décision.

## Conséquences

Cette solution ne nécessite aucun service externe et garde une suppression de
compte atomique. L’encodage base64 augmente toutefois la taille stockée
d’environ un tiers ; la limite de 1 Mio et le périmètre v1 rendent ce compromis
acceptable.

Avant d’ouvrir les profils aux autres joueurs ou d’augmenter les tailles, un
nouvel ADR devra traiter stockage objet, URLs signées ou publiques,
redimensionnement, modération, cache, métadonnées et suppression différée.

## Vérification

- tests unitaires des formats, signatures et tailles ;
- test d’intégration PostgreSQL de l’avatar et de la version du profil ;
- test API de dépôt puis restitution privée ;
- parcours navigateur des deux vues, de la bio, de l’avatar, de l’identité et
  des actions sensibles ;
- contrôle responsive et réduction des mouvements.
