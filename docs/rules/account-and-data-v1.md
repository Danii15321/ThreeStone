# Spécification compte et données v1

- Statut : acceptée
- Date : 2026-07-29
- Version cible : v1

## 1. Références normatives

Cette spécification applique :

- [`ADR-0012`](../decisions/ADR-0012-authentification-par-pseudonyme.md) pour
  l’identité, le mot de passe et la session ;
- [`ADR-0013`](../decisions/ADR-0013-profil-bio-avatar.md) pour la bio, l’avatar
  et leur persistance ;
- [`ADR-0003`](../decisions/ADR-0003-postgresql-drizzle-migrations.md) pour la
  persistance ;
- [`ADR-0005`](../decisions/ADR-0005-email-retention-minimisation.md) pour la
  rétention et la suppression des données non liées au transport email ;
- [`game-rules-v1.md`](./game-rules-v1.md) pour le résultat terminal.

Better Auth reste propriétaire des mots de passe, sessions et suppressions
d’identité. Le code applicatif ne réimplémente aucune primitive cryptographique.

## 2. États produit du compte

| État | Condition | Accès |
| --- | --- | --- |
| `anonymous` | aucune session valide | accueil, tutoriel, règles, inscription, connexion |
| `active` | session valide | jeu, compte, préférences, résultats, export, suppression |
| `deleted` | identité supprimée | aucun accès privé ; retour à `anonymous` |

Le client ne choisit jamais cet état. L’API le dérive du cookie de session.
Le profil applicatif est créé paresseusement à la première ouverture du compte.

## 3. Pseudonyme d’identité

Le pseudonyme :

- est obligatoire à l’inscription ;
- contient de 3 à 24 caractères ;
- accepte uniquement les lettres ASCII, chiffres, point et tiret bas ;
- est unique après retrait des espaces de bord et passage en minuscules ;
- conserve la casse d’origine pour l’affichage ;
- sert à la connexion mais jamais à sélectionner les données d’un autre joueur.

`Stone_Player`, `stone_player` et `STONE_PLAYER` désignent donc la même identité.
Le serveur refuse le doublon sans fournir de route séparée de disponibilité.

## 4. Inscription

1. Le formulaire collecte pseudonyme, mot de passe et, côté interface, peut
   demander une confirmation du mot de passe.
2. Le serveur valide de nouveau les deux valeurs.
3. Better Auth crée l’identité et le compte de mot de passe.
4. La session est créée immédiatement dans un cookie sécurisé.
5. Les préférences sont créées paresseusement à leur première lecture.

Le mot de passe contient de 12 à 128 caractères. Aucun email, numéro de
téléphone ou nom civil n’est demandé.

Pour satisfaire le schéma interne de Better Auth, le serveur génère une adresse
technique sous `players.invalid` à partir d’une empreinte du pseudonyme
normalisé. Cette valeur ne quitte jamais la frontière d’authentification.

## 5. Connexion, session et déconnexion

- La connexion accepte pseudonyme et mot de passe.
- Une erreur utilise un message générique pour pseudonyme absent ou mot de
  passe invalide.
- La session est transportée uniquement par cookie `httpOnly`,
  `SameSite=Lax`, et `Secure` hors développement local.
- Sa durée maximale est de 7 jours ; son rafraîchissement est borné à une fois
  par 24 heures d’activité.
- La déconnexion révoque la session courante.
- Le navigateur ne conserve ni session, ni mot de passe, ni jeton dans
  `localStorage`.

Deux sessions d’un même compte sont autorisées. Le changement de mot de passe
peut révoquer toutes les autres sessions.

## 6. Mot de passe oublié et changement

La v1 n’a pas de récupération de mot de passe oublié, puisqu’elle ne collecte
aucun canal de récupération. Cette limite est présentée sans suggérer qu’un
support peut restituer le secret.

Un joueur connecté peut changer son mot de passe :

1. il fournit le mot de passe actuel ;
2. le nouveau secret respecte les mêmes bornes ;
3. Better Auth vérifie puis remplace le secret ;
4. les autres sessions sont révoquées.

Sans session et sans mot de passe valide, le joueur doit créer un nouveau
compte. Toute future récupération sans email exige un ADR dédié.

## 7. Profil et préférences

La page de compte comporte deux vues :

- **Profil** : bannière, avatar, pseudonyme, bio, nombre total de parties,
  Stones multijoueur, Journal de jeu unifié et déconnexion ;
- **Confidentialité** : panneaux repliables pour la bio et l’avatar, le
  pseudonyme de connexion, le mot de passe et la suppression.

Le retour à l’accueil reste visible dans les deux vues. L’export de données
n’est pas présenté dans l’interface v1 ; la capacité API existante reste
réservée aux besoins de portabilité.

La définition et la persistance des Stones relèvent de
[`stones-v2.md`](./stones-v2.md). Les victoires et le taux de victoire ne sont
plus présentés comme statistiques de profil.

Le pseudonyme d’identité est modifiable par un joueur connecté. Better Auth
conserve sa forme d’affichage et impose l’unicité de sa forme normalisée. La bio
est normalisée, limitée à 280 caractères et versionnée avec le profil.

L’avatar :

- accepte uniquement JPEG, PNG ou WebP ;
- est limité à 1 Mio ;
- est validé par son type déclaré et sa signature binaire ;
- n’est accessible que par la session propriétaire ;
- est supprimé en cascade avec le profil et le compte.

Les modifications de bio et d’avatar utilisent la version optimiste du profil :
une écriture obsolète produit un conflit au lieu d’écraser une modification
plus récente.

Les préférences persistées sont :

| Champ | Valeurs |
| --- | --- |
| `difficulty` | `easy`, `standard`, `hard` |
| `muted` | booléen |
| `soundVolume` | nombre de 0 à 1 |
| `motion` | `system`, `reduce`, `no-preference` |
| `highContrast` | booléen |
| `tutorialCompleted` | booléen |

Avant connexion, ces valeurs non sensibles peuvent être conservées dans
`localStorage`. Après synchronisation, le serveur fait foi.

## 8. Résultats solo et statistiques

Seules les parties terminales conformes aux règles `1.0.0` sont persistées. Le
DTO contient l’identifiant stable de partie, la difficulté, le gagnant, les
réserves finales, le nombre de manches et les dates nécessaires.

Idempotence :

- premier contenu valide pour `gameId` : création atomique ;
- même contenu canonique répété : succès avec le résultat existant ;
- contenu différent avec le même `gameId` : conflit ;
- deux requêtes concurrentes : au plus une insertion.

L’historique est paginé et trié de façon stable. Les statistiques dérivent des
résultats et ne constituent ni classement ni preuve d’intégrité compétitive.

## 9. Autorisation et isolation

- L’identifiant utilisateur vient uniquement de la session résolue.
- Un identifiant envoyé par le client est ignoré ou refusé ; il ne sélectionne
  jamais la cible.
- Profil, préférences, export, résultats et statistiques sont filtrés par
  l’identité de session.
- Les DTO publics excluent lignes Drizzle, adresse technique interne, hachage de
  mot de passe, cookie, session et jeton.
- Les tests utilisent deux comptes et vérifient l’absence d’accès croisé.

## 10. Export

L’export JSON contient :

- pseudonyme normalisé et pseudonyme d’affichage ;
- dates de création et mise à jour du compte ;
- profil éventuel ;
- préférences ;
- résultats solo et statistiques.

Il exclut l’adresse technique Better Auth, le hachage du mot de passe, les
sessions, jetons, données de limitation de débit et informations d’autres
joueurs. Il est généré à la volée et n’est pas conservé.

## 11. Suppression

1. Le client explique précisément les données supprimées.
2. Le joueur saisit `SUPPRIMER` et son mot de passe actuel.
3. Better Auth vérifie le mot de passe et supprime l’identité.
4. Les clés étrangères en cascade suppriment sessions, profil, préférences,
   résultats et participants.
5. Le client revient à l’état anonyme.

Les sauvegardes expirent selon l’ADR-0005. Après succès, aucune route
authentifiée ne permet de retrouver les données du compte.

## 12. Limitation de débit et erreurs

| Opération | Limite initiale |
| --- | --- |
| Inscription | 5 par 15 minutes et par IP |
| Connexion | 10 par 15 minutes par IP et par pseudonyme normalisé |
| Changement de mot de passe | 3 par heure |
| Suppression | 3 par heure par session |

Une clé de pseudonyme utilisée par le limiteur est normalisée puis hachée. Les
logs n’incluent jamais pseudonyme brut saisi, mot de passe, cookie, corps
complet ou adresse technique.

Les erreurs HTTP applicatives contiennent un code stable, un message
actionnable et un identifiant de corrélation. Les erreurs d’authentification
restent génériques.

## 13. Tests RED obligatoires

### Authentification

- inscription valide et ouverture immédiate de session ;
- pseudonyme unique sans distinction de casse ;
- caractères et longueurs refusés ;
- bornes du mot de passe ;
- connexion, cookie, session et déconnexion ;
- changement de mot de passe, ancien secret refusé et nouveau accepté ;
- révocation des autres sessions ;
- routes email et disponibilité publique absentes ;
- chaque limite de débit avec clé normalisée.

### Données

- migration depuis zéro et N-1 sur PostgreSQL ;
- migration déterministe des anciens comptes ;
- deux comptes isolés ;
- export sans secret ni adresse technique ;
- suppression complète et session révoquée ;
- idempotence et concurrence des résultats ;
- cohérence entre statistiques et résultats.

### Navigateur et accessibilité

- inscription par pseudonyme jusqu’à la première partie ;
- déconnexion puis reconnexion insensible à la casse ;
- changement de mot de passe ;
- session sur deux chargements sans stockage sensible ;
- suppression avec confirmation et mot de passe ;
- parcours clavier sur les formulaires ;
- absence de dépendance à Mailpit ou à un service externe.
