# ADR-0002 — Authentification, cycle du compte et pseudonyme

- Statut : remplacé par l’ADR-0012 pour l’identité, la vérification et la récupération
- Date : 2026-07-29
- Version cible : v1

> Historique : cette décision décrit le premier modèle email. La décision
> actuelle est [`ADR-0012`](./ADR-0012-authentification-par-pseudonyme.md).

## Contexte

La v1 persiste profil, préférences et résultats solo. Elle doit fournir
inscription, connexion, vérification d'adresse, récupération, déconnexion et
suppression sans réimplémenter les primitives de sécurité. Le pseudonyme n'est
pas une identité de connexion et ne doit pas faciliter l'énumération de comptes.

## Options étudiées

1. Email et mot de passe.
2. Lien magique sans mot de passe.
3. Fournisseurs OAuth.
4. Compte invité ou jeu sans compte.

Pour le pseudonyme : unicité globale, suffixe automatique, ou valeur non unique
séparée de l'identité.

## Décision

### Identité et mot de passe

- Better Auth reste l'unique propriétaire des mots de passe, sessions,
  vérifications, jetons de récupération et suppression d'identité.
- La v1 utilise email et mot de passe. OAuth, lien magique, MFA et compte invité
  sont hors périmètre.
- L'email est nettoyé aux extrémités, comparé sans tenir compte de la casse et
  n'est jamais exposé publiquement.
- Le mot de passe contient de 12 à 128 caractères. Aucune règle artificielle de
  mélange de classes n'est imposée. Le serveur délègue le hachage et la
  vérification à Better Auth.
- Les réponses d'inscription, de connexion et de récupération ne confirment
  jamais l'existence d'une adresse.

### Vérification et accès

- La vérification de l'adresse est obligatoire avant l'accès au profil, aux
  préférences synchronisées, à une partie v1 et à l'enregistrement de résultats.
- Après vérification, un onboarding demande un pseudonyme avant la première
  partie. La création paresseuse du profil évite de coupler la transaction
  Better Auth aux tables applicatives.
- Un lien de vérification est à usage unique et expire après 60 minutes. Un
  nouvel envoi invalide les liens précédents lorsque Better Auth le permet.
- Le tutoriel et les règles restent consultables sans session.

### Session et récupération

- La session est transportée uniquement par cookie `httpOnly`, `sameSite=Lax`
  et `secure` hors développement local.
- Sa durée maximale est de 7 jours, avec rafraîchissement au plus une fois par
  24 heures d'activité. La déconnexion révoque la session courante.
- La demande de récupération retourne toujours une réponse générique.
- Le lien de récupération est à usage unique, expire après 30 minutes et le
  changement de mot de passe révoque toutes les sessions existantes.
- Le client ne place ni session, ni jeton de vérification ou récupération dans
  `localStorage`.

### Suppression et export

- La suppression exige une session et une réauthentification par mot de passe
  datant de moins de 10 minutes.
- Une confirmation explicite et non ambiguë est présentée avant suppression.
- Toutes les sessions sont révoquées immédiatement. La suppression est
  idempotente du point de vue du parcours utilisateur.
- Un export JSON à la demande contient profil, préférences, statistiques,
  résultats et métadonnées de compte non secrètes. Il est généré à la volée et
  n'est pas conservé côté serveur.
- La matrice de suppression est définie dans
  [`ADR-0005`](./ADR-0005-email-retention-minimisation.md).

### Pseudonyme

- Le pseudonyme n'est pas unique et ne sert jamais à se connecter ou à
  autoriser une action.
- Après normalisation Unicode NFKC et suppression des espaces de bord, il
  contient de 3 à 24 graphèmes.
- Il accepte lettres Unicode, marques combinantes, chiffres, espaces simples,
  apostrophes ASCII et typographiques, et traits d'union.
- Les espaces internes consécutifs sont réduits à un espace. Le pseudonyme doit
  contenir au moins une lettre et ne peut commencer ou finir par une apostrophe
  ou un trait d'union.
- Les caractères de contrôle, retours de ligne, balisage, emoji et symboles
  invisibles sont refusés.
- Une liste courte, versionnée et comparée après NFKC et case folding réserve
  exactement les termes d'usurpation `admin`, `administrator`, `moderator`,
  `modérateur`, `support`, `system`, `système`, `stonegame`, `ordinateur` et
  `computer`. Modifier cette liste est une modification de règle documentée.
- Aucune modération générale de vocabulaire n'est introduite en solo v1. Le
  texte est toujours affiché comme texte, jamais comme HTML.
- Une modification concurrente utilise une version de profil ; une écriture
  obsolète est refusée au lieu d'écraser silencieusement la plus récente.

### Limitation de débit initiale

Les seuils sont configurables et testés avec une horloge contrôlée :

| Opération               | Seuil initial                                       |
| ----------------------- | --------------------------------------------------- |
| Inscription             | 5 tentatives par 15 minutes et par adresse IP       |
| Connexion               | 10 par 15 minutes par IP et 10 par compte normalisé |
| Renvoi de vérification  | 3 par heure par compte et 10 par IP                 |
| Demande de récupération | 3 par heure par compte et 10 par IP                 |
| Suppression             | 3 tentatives par heure par compte                   |

Une réponse limitée ne révèle pas si le compte existe. Ces seuils sont une
défense initiale, à ajuster uniquement avec des mesures.

## Conséquences

- Un service d'email est nécessaire en local, test, staging et production.
- Le profil doit distinguer absence d'onboarding, pseudonyme valide et conflit
  de version.
- Les tests couvrent deux comptes, l'anti-énumération, l'expiration, l'usage
  unique, la révocation et l'accès non vérifié.
- Une indisponibilité email n'autorise pas un contournement de vérification ;
  elle produit un message récupérable et un nouvel envoi limité.
