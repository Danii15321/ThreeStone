# ADR-0012 — Authentification par pseudonyme

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1
- Remplace : identité, vérification et récupération de l’ADR-0002 ; transport
  email de l’ADR-0005

## Contexte

ThreeStone est un jeu. Demander une adresse email, la vérifier puis
utiliser des liens de récupération alourdit inutilement l’entrée en partie et
collecte une donnée personnelle qui n’est pas requise par la v1.

Better Auth reste utile pour les mots de passe, sessions et suppressions. Son
schéma cœur exige toutefois une adresse email lors d’une inscription par mot de
passe, même avec son plugin officiel `username`.

## Décision

- Le joueur s’inscrit et se connecte uniquement avec un pseudonyme et un mot de
  passe.
- Le pseudonyme contient 3 à 24 caractères parmi `A-Z`, `a-z`, `0-9`, `_` et
  `.`. Il est unique et comparé sans tenir compte de la casse.
- La casse saisie à l’inscription est conservée pour l’affichage ; une forme
  normalisée en minuscules sert à l’unicité et à la connexion.
- Le mot de passe contient 12 à 128 caractères. Better Auth reste seul
  responsable de son hachage et de sa vérification.
- L’inscription ouvre immédiatement une session. Il n’existe plus de
  vérification d’adresse.
- Un joueur connecté peut changer son mot de passe en fournissant le mot de
  passe actuel. Les autres sessions sont alors révoquées.
- La v1 ne propose pas de récupération d’un mot de passe oublié. Sans session
  valide ni mot de passe, le joueur crée un nouveau compte.
- La suppression exige le mot de passe actuel et une confirmation explicite ;
  elle ne dépend plus d’un lien envoyé.
- Les routes Better Auth fondées sur l’email et la route de disponibilité du
  pseudonyme sont bloquées publiquement. L’absence de vérification de
  disponibilité évite un endpoint d’énumération dédié.

## Compatibilité Better Auth

- Le plugin officiel `username` fournit la normalisation, l’unicité et la
  connexion.
- L’API expose `/api/auth/sign-up/username`, puis adapte en interne la requête
  vers la primitive d’inscription par mot de passe de Better Auth.
- Une adresse technique déterministe, hachée et terminée par
  `@players.invalid` satisfait le champ interne obligatoire. Elle n’est ni une
  adresse réelle, ni une donnée demandée au joueur.
- Cette valeur n’est jamais acceptée par une route publique, affichée,
  journalisée ou incluse dans une session ou un export.
- Les colonnes historiques `email` et `email_verified` restent dans le schéma
  Better Auth tant que la bibliothèque les exige. Elles ne font pas partie du
  modèle produit.

## Migration

Les comptes existants reçoivent un pseudonyme normalisé dérivé de leur ancien
nom d’affichage. Une courte empreinte de l’identifiant est ajoutée uniquement
si la valeur est invalide ou en conflit. Le nom d’affichage est conservé dans
la limite de 24 caractères.

## Limitation de débit

| Opération | Seuil initial |
| --- | --- |
| Inscription | 5 tentatives par 15 minutes et par adresse IP |
| Connexion | 10 par 15 minutes par IP et 10 par pseudonyme normalisé |
| Changement de mot de passe | 3 par heure |
| Suppression | 3 par heure par session |

Les clés de compte sont hachées avant stockage dans le limiteur et les erreurs
de connexion restent génériques.

## Conséquences

- SMTP et Mailpit disparaissent du runtime local, de la CI et de la
  configuration.
- Le parcours d’inscription est plus court et aucune adresse personnelle n’est
  collectée.
- La perte du mot de passe n’est pas récupérable en v1 ; cette limite doit être
  annoncée clairement.
- Une stratégie de récupération sans email devra faire l’objet d’une nouvelle
  décision si le besoin devient significatif.
