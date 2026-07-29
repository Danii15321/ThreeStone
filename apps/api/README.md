# API v1

L’API Hono expose :

| Route | Authentification | Usage |
| --- | --- | --- |
| `/api/auth/sign-up/username` | Non | Inscription par pseudonyme et mot de passe |
| `/api/auth/sign-in/username` | Non | Connexion par pseudonyme et mot de passe |
| `/api/auth/change-password` | Oui | Changement du mot de passe |
| `/api/auth/sign-out` | Oui | Déconnexion |
| `/api/auth/delete-user` | Oui | Suppression après confirmation du mot de passe |
| `GET /api/health/live` | Non | Processus actif |
| `GET /api/health/ready` | Non | Connexion PostgreSQL disponible |
| `GET/PATCH /api/profile` | Oui | Profil applicatif |
| `GET/PUT /api/preferences` | Oui | Préférences synchronisées |
| `POST/GET /api/results/solo` | Oui | Écriture idempotente et historique |
| `GET /api/stats/solo` | Oui | Statistiques solo |
| `GET /api/account/export` | Oui | Export JSON à la volée sans secret |

Toutes les entrées et sorties applicatives sont validées par
`@three-stone/api-contracts`. L’identité est toujours dérivée du cookie de
session ; aucun identifiant utilisateur fourni dans un corps de requête ne
sélectionne une ressource.

Variables supplémentaires : `AUTH_RATE_LIMIT_MAX`,
`AUTH_RATE_LIMIT_WINDOW_SECONDS` et `MAX_REQUEST_BODY_BYTES`.

Tests avec PostgreSQL :

```bash
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @three-stone/api test
```
