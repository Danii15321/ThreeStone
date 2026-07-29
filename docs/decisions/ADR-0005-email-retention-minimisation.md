# ADR-0005 — Email, minimisation, rétention et suppression

- Statut : partiellement remplacé par l’ADR-0012
- Date : 2026-07-29
- Version cible : v1

> Le transport email n’est plus utilisé en v1. Les règles de minimisation,
> suppression, sauvegarde et rétention des autres données restent applicables.

## Contexte

La vérification et la récupération requièrent un transport email. La v1 doit
minimiser les données personnelles, fixer leur durée de vie et rendre la
suppression vérifiable sans coupler le produit à un fournisseur.

## Options étudiées

1. API propriétaire d'un fournisseur d'email.
2. Adaptateur SMTP standard et fournisseur configurable.
3. Aucun email et aucune vérification.

Pour les résultats : conservation indéfinie, anonymisation, ou suppression avec
le compte.

## Décision

### Transport email

- L'API dépend d'un port applicatif d'envoi, implémenté par un adaptateur SMTP.
- En local, Mailpit capture les messages et expose son interface uniquement sur
  la machine de développement.
- En test, un faux en mémoire capture sujet, destinataire et lien sans réseau.
- En staging et production, le fournisseur est configurable par hôte, port,
  mode TLS, identifiants, expéditeur et URL publique. Aucun nom de fournisseur
  n'apparaît dans le domaine ou les contrats HTTP.
- TLS est obligatoire hors local. Les secrets SMTP proviennent du gestionnaire
  de secrets de la plateforme.
- Les messages contiennent uniquement le destinataire, la finalité, un lien
  HTTPS à usage unique et les informations légales minimales. Aucun mot de
  passe, cookie, profil, pseudonyme ou résultat n'est envoyé.
- L'URL de destination est construite depuis une origine serveur autorisée,
  jamais depuis un paramètre de requête non fiable.
- Un timeout de 5 secondes borne une tentative. La v1 n'ajoute pas de file
  d'email : un échec conserve le compte dans son état courant et permet un
  nouvel envoi explicite, limité et idempotent. L'API n'affirme jamais une
  livraison certaine.

### Matrice de données

| Donnée                                    | Finalité                | Conservation active                 | Suppression/expiration                         |
| ----------------------------------------- | ----------------------- | ----------------------------------- | ---------------------------------------------- |
| Email, secret haché et compte Better Auth | Identité                | Vie du compte                       | Suppression du compte                          |
| Session                                   | Authentification        | 7 jours maximum                     | Révocation ou purge sous 24 h après expiration |
| Vérification/récupération                 | Usage unique            | 60/30 minutes                       | Purge sous 24 h après usage ou expiration      |
| Profil et pseudonyme                      | Présentation            | Vie du compte                       | Suppression du compte                          |
| Préférences                               | Expérience              | Vie du compte                       | Suppression du compte                          |
| Résultats solo et participants IA         | Historique/statistiques | Vie du compte                       | Suppression en cascade avec le compte          |
| Projection statistique                    | Lecture rapide          | Vie du compte                       | Suppression avec le compte ; reconstructible   |
| État de limitation de débit               | Protection              | 24 heures maximum                   | Expiration automatique                         |
| Logs applicatifs                          | Exploitation            | 14 jours                            | Purge automatique                              |
| Événements de sécurité pseudonymisés      | Détection d'abus        | 30 jours                            | Purge automatique                              |
| Métadonnées de livraison SMTP             | Diagnostic              | 7 jours maximum chez le fournisseur | Purge fournisseur                              |
| Sauvegardes chiffrées                     | Reprise après sinistre  | 14 jours                            | Rotation automatique                           |

Les logs n'incluent jamais email brut, mot de passe, cookie, jeton, corps complet
ou choix caché. Un identifiant utilisateur journalisé est un pseudonyme
technique non réversible hors service. Aucune télémétrie produit ou publicité
n'est activée en v1.

### Suppression et sauvegardes

- La suppression d'un compte efface dans une transaction les tables
  applicatives appartenant à l'utilisateur puis demande à Better Auth de
  supprimer l'identité et ses sessions selon son mécanisme supporté.
- Les résultats v1 étant exclusivement solo, ils sont supprimés plutôt
  qu'anonymisés. Il n'existe aucun autre joueur dont l'historique serait altéré.
- Une preuve de test vérifie l'absence de lignes accessibles sans conserver
  l'adresse ou le pseudonyme supprimé.
- Les copies présentes dans une sauvegarde vieillissent naturellement sous
  14 jours et ne sont pas consultables en exploitation courante. Après
  restauration, le registre opérationnel chiffré des suppressions réalisées
  depuis le point de sauvegarde est rejoué avant remise en service.
- Ce registre contient un identifiant interne chiffré, la date et le statut,
  jamais l'email, et est conservé 30 jours.

## Conséquences

- Le contrat du fournisseur SMTP doit permettre une rétention de métadonnées de
  7 jours maximum et un traitement compatible avec le territoire de
  déploiement.
- Mailpit doit être ajouté au compose local avant le lot d'authentification.
- Les tâches de purge sont testées avec une horloge injectée.
- La v2 devra réexaminer la suppression des résultats partagés avant
  d'introduire des parties entre deux comptes.
