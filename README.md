![Logo ThreeStone](./docs/logo.png)

# ThreeStone

**Art du bluff ou science de la déduction.** Un jeu de stratégie à deux joueurs :
deviner le contenu des mains et se débarrasser de ses trois cailloux, dans un
univers fantasy nordique. Jouez contre l'IA ou invitez un adversaire en ligne.

**[Jouer à ThreeStone](https://three-stone.vercel.app)**

## Règles

Chaque joueur commence avec **trois cailloux**. À chaque manche :

1. Chacun cache entre zéro et le nombre de cailloux de sa réserve.
2. Les joueurs annoncent à tour de rôle un total entre **0 et 6** pour les deux
   mains. Le second doit choisir un nombre différent du premier.
3. Les mains sont révélées. Un pronostic exact retire **un caillou** de la
   réserve ; sans bonne réponse, les réserves ne changent pas.
4. Les cailloux cachés reviennent dans les réserves. Le premier à atteindre
   **zéro caillou gagne**.

Le premier annonçant alterne à chaque manche et entre deux parties successives.
Un pronostic impossible reste autorisé : le bluff fait partie du jeu.

## Fonctionnalités

- **Solo** : trois difficultés d'IA, décisions reproductibles et choix adverses secrets.
- **Compte** : pseudonyme, avatar, bio, préférences, historique et suppression du compte.
- **Duels privés** : invitation par code, serveur autoritaire, délais, reconnexion,
  abandon, score de session et revanche.
- **Interface** : plateau animé, souris, tactile, clavier, contraste renforcé et
  réduction des mouvements ; aucun audio.
- **Progression** : Stones, classes B/A/S et récompenses Main, Œil et Cœur de pierre,
  avec cinq duels cotés maximum par paire sur 24 heures.

La progression est implémentée dans le dépôt, mais attend encore la migration
`0007` et son déploiement coordonné. Le site publié a été vérifié sur la révision
`1f7f9f1` le 14 octobre 2026.

## Choix techniques

| Couche         | Technologies                                                        |
| -------------- | ------------------------------------------------------------------- |
| Interface      | React, Vite, Phaser, CSS Modules                                    |
| Règles et IA   | TypeScript strict, moteur pur partagé, hasard initialisé par graine |
| API et comptes | Hono, Better Auth, Zod                                              |
| Données        | PostgreSQL, Drizzle                                                 |
| Multijoueur    | Colyseus, WebSocket                                                 |
| Qualité        | pnpm, Vitest, Playwright, GitHub Actions                            |

**Vercel** héberge le client et l'API, **Render** le serveur de jeu et **Neon**
PostgreSQL. Le moteur décide des règles ; React et Phaser affichent ses résultats.
Le serveur garde les choix secrets et valide les actions multijoueurs.

## Organisation

- `apps/` : client web, API et serveur de jeu.
- `packages/` : moteur, IA, contrats HTTP, base de données, protocole et outils de test.
- `docs/logo.png` : logo de référence.
- [AGENTS.md](./AGENTS.md) : consignes techniques et collaboration des agents.

Le travail suit **cadrage → tests → implémentation → revue → vérification**,
avec des responsabilités séparées et des tests verrouillés avant implémentation.
Les consignes locales de `.agents/`, lorsqu'il existe, complètent `AGENTS.md`.
Ce README est l'unique documentation du projet.

## Développement

Prérequis : **Node.js 24**, **pnpm 10.34.5** via Corepack et **Docker**.

```bash
corepack enable
pnpm install
cp .env.example .env
# Remplacer les trois secrets applicatifs par des valeurs aléatoires distinctes.
docker compose up -d
pnpm db:migrate
pnpm dev
```

Pour le multijoueur, lancer `pnpm dev:game-server` dans un second terminal.
Client : `http://localhost:5173` ; API : `http://localhost:3001` ;
serveur de jeu : `ws://localhost:2567`.
Les commandes de vérification figurent dans `package.json` et `AGENTS.md`.

## Limites

- Pas de récupération de mot de passe oublié, matchmaking public, classement
  public, chat, amis ou achats.
- Serveur multijoueur unique : un crash peut perdre les parties en cours et les
  résultats encore en attente d'enregistrement. Render gratuit peut demander
  environ une minute pour sortir de veille.
- Les résultats solo proviennent du navigateur et ne rapportent pas de Stones.
- Restent à fiabiliser : sauvegarde solo en cas d'erreur, confirmation d'abandon,
  fermeture des connexions et salons, limitation des requêtes sur Vercel.
- Le dernier audit des dépendances et un test mobile à zoom 200 % échouaient ;
  ces contrôles doivent passer avant une nouvelle release.

## Visuels

Visuels intégrés avec l'autorisation du propriétaire : logo fourni dans
`docs/logo.png` ; accueil fourni avec Gemini et mains générées avec OpenAI à
partir de ses références Gemini (29 juillet 2026) ; récompenses de pierre
générées avec OpenAI (2 août 2026). Les versions utilisées par le jeu sont dans
`apps/web/src/assets/`.
