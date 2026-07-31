# ThreeStone

**ThreeStone** est un jeu de stratégie, de déduction et de bluff pour deux
joueurs. Chaque joueur cherche à être le premier à se débarrasser de ses trois
cailloux en devinant la somme cachée dans les deux mains.

La **candidate v2 est jouable et vérifiée localement** : elle conserve la
boucle solo et ajoute des salons privés à deux joueurs, un serveur Colyseus
autoritaire, la reprise de connexion, les délais visibles, la demande de
rejouer avec acceptation explicite, le score de session et l’historique partagé. Le client React/Vite
utilise Phaser en Canvas ; l’API Hono et le serveur de jeu s’appuient sur Better
Auth, PostgreSQL, Drizzle et des contrats Zod stricts.

## Démarrage local

Prérequis : Node.js `24.18.0` (voir `.nvmrc`), Corepack et Docker pour
PostgreSQL.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Pour le multijoueur, lancer dans un second terminal :

```bash
pnpm dev:game-server
```

L’application web est disponible sur `http://localhost:5173`, l’API sur
`http://localhost:3001` et le serveur de jeu sur `ws://localhost:2567`.

Commandes principales :

```bash
pnpm check                 # format, lint, build, types et tests rapides
TEST_DATABASE_URL="postgres://three_stone_game:local-development-only@localhost:5432/three_stone_game" pnpm test:integration
pnpm test:e2e              # parcours Chromium, Firefox et WebKit
pnpm test:multiplayer      # domaine autoritaire et serveur Colyseus
pnpm test:load:multiplayer # 20 salons et 40 connexions
pnpm audit:security        # aucun avis de production élevé ou critique
pnpm validate:v2           # toutes les portes locales de la candidate v2
pnpm db:generate           # génère une migration Drizzle
pnpm db:migrate            # applique les migrations
```

Lors de la première utilisation de Playwright, installer ses moteurs avec
`pnpm exec playwright install chromium firefox webkit`.

## Objectifs du projet

- Proposer des parties courtes, lisibles et rejouables.
- Donner une vraie place au bluff, sans permettre à l'ordinateur de tricher.
- Créer une présentation 2D/2.5D fantasy nordique stylisée, tactile et
  attrayante.
- Livrer d'abord une expérience solo solide contre une IA.
- Permettre au joueur de retrouver son profil, ses préférences et ses résultats
  grâce à un compte persistant dès la v1.
- Proposer un mode multijoueur privé juste, sans exposer les choix cachés.
- Fonctionner dans un navigateur moderne, sur ordinateur comme sur mobile.

## Règles de référence

Une partie oppose deux joueurs. Au début de la partie, chacun possède trois
cailloux dans sa réserve.

À chaque manche :

1. Chaque joueur choisit secrètement entre zéro et le nombre de cailloux encore
   présents dans sa réserve, puis les cache dans sa main.
2. Un premier joueur annonce un pronostic sur la somme des deux mains.
3. L'autre joueur annonce un pronostic différent.
4. Les deux mains sont révélées simultanément.
5. Si un pronostic correspond exactement à la somme révélée, son auteur retire
   un caillou de sa réserve.
6. Si aucun pronostic n'est correct, les réserves ne changent pas et une
   nouvelle manche commence.
7. Le premier joueur dont la réserve atteint zéro remporte la partie.

Le premier joueur à annoncer alterne à chaque manche. Entre deux parties
successives, le joueur qui commence la première manche alterne également.

Les cailloux cachés dans une main servent uniquement à calculer la somme de la
manche : ils retournent ensuite dans la réserve. Le caillou retiré après un bon
pronostic est, lui, définitivement déposé.

Les pronostics sont des entiers compris entre `0` et `6`, bornes incluses. Un
joueur peut volontairement annoncer une valeur impossible dans l'état courant
afin de perturber son adversaire.

### Exemple

- Alice possède encore trois cailloux et en cache deux.
- L'ordinateur possède encore deux cailloux et en cache un.
- Alice annonce `2`, puis l'ordinateur annonce `3`.
- La somme révélée vaut `3` : l'ordinateur retire un caillou de sa réserve.

## Décisions de règles validées

- Les cailloux cachés retournent dans la réserve après la révélation : ils ne
  constituent pas une mise perdue.
- Un pronostic est un entier compris entre `0` et `6`, bornes incluses. Une
  valeur peut donc être autorisée par l'interface tout en étant impossible dans
  l'état courant de la partie.
- Un bon pronostic retire toujours exactement un caillou de la réserve,
  indépendamment du nombre caché dans la main.
- Une manche sans bon pronostic est rejouée sans pénalité et sans limite
  particulière.
- Les pronostics sont annoncés séquentiellement. Le second joueur ne peut pas
  reprendre le pronostic du premier.
- Le premier joueur à annoncer alterne à chaque manche afin de répartir
  l'avantage informationnel du second pronostic.
- Le joueur qui commence la première manche alterne d'une partie à la suivante.

Ces décisions sont verrouillées par les tests du moteur avant leur projection
dans React et Phaser.

## Direction artistique officielle

ThreeStone adopte une **fantasy stylisée d’inspiration nordique et
médiévale**, proche d’un rendu *hand-painted* de jeu vidéo. Les volumes sont
massifs et légèrement anguleux, les pierres paraissent sculptées, les surfaces
évoquent le cuir, le bois, le métal bruni et le parchemin, avec une lumière
chaude de taverne.

La palette de référence associe :

- bruns cuir et bois pour les structures et actions ;
- beige, ivoire et blanc cassé pour les textes et surfaces de lecture ;
- gris pierre chaud pour les panneaux, éléments de jeu et séparateurs ;
- ambre, bronze et laiton pour les accents, le focus et les actions principales ;
- charbon brun plutôt que noir ou bleu pur pour les arrière-plans.

Le logo [`docs/logo.png`](./docs/logo.png) est la référence de marque. Le client
utilise une variante web optimisée sous 350 Ko, conformément aux budgets
visuels. Le rendu reste en 2D/2.5D et privilégie des textures suggérées par les
formes, les dégradés et les ombres plutôt qu’une vraie scène 3D.

L'interface doit notamment prévoir :

- une lecture immédiate du nombre de cailloux restant à chaque joueur ;
- une séparation claire entre choix secret, pronostic, révélation et résultat ;
- des animations courtes qui ne bloquent jamais la partie ;
- un bouton permettant de passer ou d'accélérer les animations ;
- des commandes à la souris, au tactile et au clavier ;
- des contrastes suffisants et une solution qui ne repose pas uniquement sur
  la couleur ;
- un mode de réduction des mouvements ;
- une mise en page responsive, en portrait et en paysage.

Les menus et contrôles accessibles devraient rester en HTML. Le plateau et les
animations peuvent être rendus dans un canvas.

L’accueil reste volontairement minimal : la devise « Art du bluff ou science
de la déduction » apparaît sur le visuel des deux mains, avec uniquement les
actions « Commencez une partie » et « Comment jouer ». Le lancement suit le
parcours mode de jeu → difficulté → préparation de la table → partie. Le mode
multijoueur ouvre un salon privé réel avec un code d’invitation. Mouvements et
contraste sont regroupés dans « Paramètres du jeu ».

## Roadmap

### Phase 0 — Cadrage — terminée

- Formaliser les règles validées et leur version initiale.
- Définir le périmètre exact de la v1.
- Valider le parcours de compte, les données conservées et leur durée de
  rétention.
- Réaliser un prototype de boucle de jeu sans rechercher le rendu final.
- Valider la direction artistique et les contraintes de performance.

### Version 1 — Solo contre l'ordinateur — candidate vérifiée localement

- Partie complète contre une IA respectant strictement les mêmes règles.
- Création de compte et connexion par pseudonyme unique et mot de passe.
- Changement de mot de passe authentifié, déconnexion et suppression immédiate
  après confirmation du mot de passe.
- Pas de récupération d’un mot de passe oublié en v1.
- Profil joueur avec bannière, avatar, bio, pseudonyme modifiable, statistiques
  solo et dernières parties.
- Persistance PostgreSQL des comptes, sessions, profils, préférences et
  résultats de parties terminées.
- Accès direct et accessible aux règles depuis l’accueil.
- Choix secret, pronostics, révélation, résolution et écran de fin.
- IA probabiliste avec comportement reproductible dans les tests.
- Au moins un niveau équilibré ; plusieurs difficultés seulement si elles sont
  calibrées par des parties simulées.
- Interface responsive, accessible et jouable au clavier.
- Direction visuelle hand-painted nordique, animations et réglages locaux,
  sans musique ni effets sonores.
- API authentifiée avec validation stricte, limitation de débit sur les routes
  sensibles et migrations de base de données versionnées.

### Version 1.x — Finition

- Amélioration de l'IA à partir de statistiques de parties.
- Tableau de bord de statistiques plus détaillé, si les données collectées en
  v1 permettent de le faire sans nouvelle donnée personnelle.
- Variantes cosmétiques et options d'accessibilité supplémentaires.
- Optimisation du chargement des images.
- Éventuel mode local à deux joueurs si l'expérience de choix secret est
  satisfaisante sur un appareil partagé.

### Version 2 — Multijoueur privé — candidate vérifiée localement

- Salons privés avec code d'invitation.
- Serveur autoritaire : le client propose une action, le serveur la valide et
  décide de l'état officiel.
- Protection stricte des choix cachés jusqu'à la révélation.
- Reconnexion, abandon, délai de tour et gestion des déconnexions.
- Synchronisation et transcript validé des manches d'une partie.
- Enregistrement idempotent du résultat multijoueur dans le profil des deux
  participants.
- Score de session et demande de rejouer acceptée ou refusée explicitement.

Le matchmaking public, le classement compétitif, les amis et les achats ne font
pas partie du premier incrément multijoueur. Ils nécessiteront une décision
produit séparée.

## Stack technique retenue

Cette stack privilégie une application web légère et un langage commun au
client, à l’IA et au serveur autoritaire.

| Besoin | Choix recommandé | Pourquoi |
| --- | --- | --- |
| Langage | TypeScript en mode strict | Modèle de règles sûr et partageable entre client et serveur |
| Gestion du dépôt | pnpm workspaces | Monorepo léger et dépendances partagées |
| Interface | React | Menus, réglages et contrôles HTML accessibles |
| Build web | Vite | Démarrage rapide, configuration réduite et bon support TypeScript |
| Rendu du plateau | Phaser en Canvas | Moteur 2D web portable ; les contrôles restent dans le DOM accessible |
| Styles | CSS Modules + variables CSS | Thème fantasy nordique cohérent, tokens cuir/pierre/parchemin et absence de dépendance utilitaire |
| API v1 | Hono sur Node.js | API légère fondée sur les standards Web et intégration directe avec l'authentification |
| Validation | Zod | Validation et contrats typés aux frontières HTTP et réseau |
| Authentification v1 | Better Auth + plugin username | Pseudonyme unique, mots de passe et sessions sans développer un système maison |
| Base de données v1 | PostgreSQL | Persistance durable des comptes, profils et résultats, réutilisable en v2 |
| Accès aux données | Drizzle ORM + migrations SQL versionnées | Schéma TypeScript explicite et migrations contrôlées |
| Tests unitaires | Vitest | Intégration naturelle avec Vite et tests rapides du moteur |
| Tests de propriétés | Générateurs déterministes internes | Vérification reproductible des invariants sur de nombreuses parties simulées |
| Tests navigateur | Playwright | Parcours complets sur plusieurs moteurs de navigateur |
| Multijoueur v2 | Colyseus sur Node.js | Salons, serveur autoritaire et synchronisation d'état adaptés au jeu |
| Stockage navigateur | `localStorage` non sensible | Préférences utilisables avant connexion ; jamais de session ou secret de jeu |
| Cache distribué | Aucun ; Redis seulement en v2+ si nécessaire | À ajouter uniquement avec plusieurs instances ou une présence distribuée |

Phaser fournit officiellement des modèles React + Vite en TypeScript. Better
Auth fournit une intégration Hono et un adaptateur Drizzle. Colyseus porte la
v2 : son modèle où le serveur est seul à modifier l’état partagé correspond aux
informations cachées du jeu.

Références :

- [Documentation Phaser](https://docs.phaser.io/)
- [Modèles de projet Phaser](https://docs.phaser.io/phaser/getting-started/project-templates)
- [Documentation Vite](https://vite.dev/guide/)
- [Documentation Vitest](https://vitest.dev/guide/)
- [Intégration Hono de Better Auth](https://better-auth.com/docs/integrations/hono)
- [Migrations Drizzle](https://orm.drizzle.team/docs/migrations)
- [Synchronisation d'état avec Colyseus](https://docs.colyseus.io/state)
- [Documentation Playwright](https://playwright.dev/docs/intro)

### Choix volontairement écartés pour la v1

- **Next.js** : le rendu serveur n'est pas nécessaire au jeu. Une SPA React/Vite
  et une API Hono séparent clairement le client interactif, l'authentification
  et le futur serveur de jeu.
- **Vraie 3D avec Three.js/Babylon.js** : elle augmente fortement le coût des
  assets, des interactions et des performances. Ce choix devra être réévalué si
  la 3D devient une exigence produit.
- **IA par apprentissage automatique** : une stratégie probabiliste explicable
  est plus simple à tester, équilibrer et faire évoluer pour un jeu aussi
  compact.
- **SQLite en production** : PostgreSQL évite une migration de moteur au moment
  où la v2 introduit des connexions concurrentes et des résultats multijoueurs.
- **Authentification développée à la main** : mots de passe, sessions,
  changement de secret et suppression doivent reposer sur une bibliothèque
  maintenue.

## Architecture recommandée

Le moteur de règles doit être indépendant de React, Phaser, du réseau et du
stockage. Il reçoit une action valide, produit un nouvel état et émet les
événements nécessaires à la présentation. L'horloge et l'aléatoire sont injectés
afin que les parties et l'IA soient reproductibles.

```mermaid
flowchart LR
    UI["Interface React<br/>menus et contrôles"] --> C["Contrôleur de partie"]
    P["Présentation Phaser<br/>plateau et animations"] <--> C
    A["Adaptateur IA (solo)<br/>observation autorisée"] --> C
    C -->|"mode solo"| G["Moteur de règles pur<br/>état, actions, événements"]
    UI -->|"compte, profil, résultats"| API["API Hono (v1)<br/>authentification et application"]
    API --> AUTH["Better Auth"]
    API --> DB[("PostgreSQL")]
    AUTH --> DB
    C -->|"actions en ligne"| N["Client réseau (v2)"]
    N -->|"état public"| C
    N <--> S["Serveur Colyseus (v2)<br/>autorité de la partie"]
    S --> G
    S -->|"résultat final idempotent"| DB
```

Principes structurants :

- Le moteur de règles ne dépend d'aucun framework.
- React orchestre les écrans et les contrôles accessibles ; Phaser présente le
  plateau, sans décider des règles.
- L'IA reçoit uniquement les informations qu'un joueur humain est autorisé à
  connaître. Elle ne lit jamais le choix secret de l'adversaire.
- En solo, le client utilise directement le moteur.
- L'API v1 gère identité, profil, préférences et résultats, mais ne pilote pas
  les transitions du moteur solo.
- En ligne, le serveur utilise le même moteur et devient l'unique autorité.
- L'état public et les choix privés sont des modèles distincts.
- Les animations réagissent à des événements du domaine ; elles ne modifient
  jamais directement l'état de la partie.

### Organisation du dépôt

La v2 matérialise les applications et packages ci-dessous :

```text
apps/
  web/                 Application React, plateau Phaser Canvas et parcours E2E
  api/                 API Hono, authentification et cas d'usage persistants
  game-server/         Serveur multijoueur Colyseus autoritaire
packages/
  game-core/           Règles, états, actions, événements et invariants
  game-ai/             Stratégies de l'ordinateur
  api-contracts/       Schémas d'entrée/sortie partagés, sans logique métier
  database/            Schéma Drizzle, migrations SQL et accès serveur uniquement
  protocol/            Messages réseau, projections publiques et privées
  test-support/        Générateurs et scénarios partagés de test
docs/
  ARCHITECTURE.md      Architecture logique, données, sécurité et déploiement
  pipeline-complete.md Pipeline de réalisation jusqu'à la v2 finale
  decisions/           ADR : décisions techniques et produit importantes
  rules/               Règles détaillées et cas limites
```

Il est également raisonnable de commencer avec ces modules sous `apps/web/src`
et de les extraire en packages avant la v2. Le critère essentiel est le respect
des frontières, pas le nombre de dossiers.

## Modèle de domaine attendu

Le vocabulaire reste stable dans le code et les tests :

- **Game** : partie complète, de l'initialisation à la victoire.
- **Round** : manche comprenant choix, pronostics, révélation et résolution.
- **Player** : humain, ordinateur ou participant distant.
- **Reserve** : nombre de cailloux qu'un joueur doit encore éliminer.
- **Hidden choice** : nombre de cailloux cachés pour la manche.
- **Prediction** : somme annoncée par un joueur.
- **Game action** : intention soumise au moteur.
- **Domain event** : fait confirmé utilisé par l'interface, les animations ou le
  réseau.

La partie suit une machine à états explicite : initialisation, choix secrets,
pronostics, révélation, résolution, puis fin. Une action reçue dans une phase
incompatible est refusée.

### Invariants essentiels

- Une réserve reste comprise entre zéro et trois.
- Un choix caché reste compris entre zéro et la réserve du joueur.
- Les deux pronostics d'une manche sont différents.
- Au maximum un joueur gagne une manche.
- Une bonne prédiction retire exactement un caillou.
- Une partie terminée n'accepte plus d'action de jeu.
- Une information secrète ne se retrouve jamais dans l'état public.
- À graine et historique identiques, l'IA produit le même résultat.

## Stratégie pour l'IA

La première IA devrait être probabiliste et explicable :

1. Estimer les choix possibles de l'adversaire à partir de sa réserve.
2. Construire une distribution des sommes possibles.
3. Tenir compte des annonces et habitudes observées lors des manches
   précédentes.
4. Choisir parfois une prédiction de bluff selon son niveau.
5. Utiliser une source aléatoire injectée et initialisée par une graine.

Les niveaux de difficulté doivent modifier la qualité de l'estimation, la
mémoire et le taux d'erreur, jamais donner accès au choix caché du joueur.
L'équilibrage devra être mesuré sur de nombreuses parties simulées plutôt que
jugé uniquement à l'intuition.

## Qualité et tests

Le moteur compact permet une couverture particulièrement forte :

- tests unitaires de chaque transition de phase ;
- tests des cas limites et des actions illégales ;
- tests génératifs de tous les invariants ;
- scénarios complets jusqu'à la victoire ;
- tests de légalité, déterminisme et niveau de l'IA ;
- tests d'intégration entre événements du moteur et présentation ;
- tests d'intégration de l'API, de l'authentification et des repositories sur
  une base isolée ;
- tests des migrations, de l'autorisation et de la suppression des données ;
- tests navigateur des parcours critiques et de l'accessibilité ;
- en v2, tests de confidentialité, reconnexion, délai, abandon et convergence
  des clients vers l'état du serveur.

Une modification de règle commence par un test qui échoue pour la bonne raison.
Une fois accepté, ce test devient la référence et ne doit pas être affaibli pour
faire passer l'implémentation.

## Critères de réussite de la v1

La candidate actuelle satisfait les critères fonctionnels ci-dessous sur un
environnement local propre. La qualification staging et la répétition de
restauration restent des opérations de release. La production v1 utilise un
projet Vercel unique et PostgreSQL Neon conformément à
[`ADR-0014`](./docs/decisions/ADR-0014-deploiement-vercel-v1.md).

- une partie peut être jouée du début à la fin sans blocage ;
- un joueur peut créer son compte par pseudonyme, ouvrir et fermer une session,
  personnaliser son profil, changer son pseudonyme ou son mot de passe et
  supprimer son compte ;
- profil, préférences, statistiques et résultats solo sont persistés sans
  doublon et restent isolés entre utilisateurs ;
- toutes les règles validées sont couvertes par des tests ;
- l'IA ne triche pas et ne produit jamais d'action illégale ;
- les informations secrètes ne sont pas révélées prématurément ;
- l'interface fonctionne au clavier, au tactile et à la souris ;
- le jeu reste lisible sur les tailles d'écran ciblées ;
- les animations peuvent être réduites ou désactivées ; aucun son n’est livré ;
- les erreurs n'interrompent pas silencieusement une partie ;
- les routes sensibles sont protégées, limitées et ne divulguent aucune donnée
  personnelle ou information de session ;
- les migrations peuvent être appliquées sur une base vierge et sur la version
  précédente, avec une stratégie de retour arrière documentée ;
- lint, vérification des types, tests et build de production réussissent ;
- les assets utilisés ont une licence et une provenance documentées.

Preuves reproductibles :

- `pnpm check` valide format, lint, builds, types et suites Vitest ;
- les tests API avec `TEST_DATABASE_URL` couvrent Better Auth et les
  repositories sur PostgreSQL réel ;
- `pnpm test:e2e` couvre le parcours compte → partie → statistiques →
  suppression, plus le mobile et la réduction des mouvements sur Chromium,
  Firefox et WebKit ;
- la CI démarre PostgreSQL, applique les migrations puis rejoue ces contrôles.

## Livraison et exploitation

La v1 sert le client Vite et l’API Hono depuis Vercel sous la même origine
HTTPS. La v2 ajoute un Web Service Render long vivant pour Colyseus ; le
game-server ne doit pas être exécuté dans une fonction Vercel.

La candidate v2 est préparée mais n’est ni poussée ni déployée. Une validation
explicite est nécessaire avant chaque action distante. La procédure complète,
les variables, la migration, les smoke tests, le drainage de dix minutes et le
retour arrière sont décrits dans
[`docs/OPERATIONS_V2.md`](./docs/OPERATIONS_V2.md).

Avant toute autorisation, `pnpm validate:v2` doit être vert avec PostgreSQL
local disponible. Cette commande ne migre et ne déploie aucun environnement
distant.

## Documentation associée

- [`AGENTS.md`](./AGENTS.md) : règles de travail destinées aux agents de
  développement.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) : architecture détaillée du
  client, de l'API, des données et du serveur multijoueur.
- [`docs/pipeline-complete.md`](./docs/pipeline-complete.md) : séquence de
  développement historique de la phase 0 à la v1.
- [`docs/SPEC_V2.md`](./docs/SPEC_V2.md) : contrat fonctionnel et technique du
  multijoueur privé.
- [`docs/PIPELINE_V2.md`](./docs/PIPELINE_V2.md) : séquence TDD et portes
  proportionnées de la v2.
- [`docs/VALIDATION_V2.md`](./docs/VALIDATION_V2.md) : preuves, limites et point
  de décision avant push ou staging.
- [`docs/OPERATIONS_V2.md`](./docs/OPERATIONS_V2.md) : runbook de migration,
  santé, drainage, supervision et retour arrière.
- Les futures décisions structurantes devront être conservées sous forme d'ADR
  dans `docs/decisions/`.
