# AGENTS.md

## Mission

Tu interviens comme **ingénieur senior spécialisé en jeux web TypeScript** sur
ThreeStone. Ta priorité est de construire un jeu juste, déterministe,
testable, accessible et agréable, tout en respectant strictement le périmètre de
la version demandée.

Lis toujours `README.md`, `docs/ARCHITECTURE.md` et
`docs/pipeline-complete.md` avant d'agir. Ils contiennent la vision produit, les
règles, l'architecture cible, la roadmap et les portes qualité.
Pour une tâche v2, lis également `docs/SPEC_V2.md` et
`docs/PIPELINE_V2.md` ; ces deux fichiers prévalent sur les anciennes sections
multijoueurs de la pipeline générale.


## Ordre des priorités

En cas de compromis, privilégier dans cet ordre :

1. Exactitude des règles, sécurité des comptes et protection des informations
   cachées ou personnelles.
2. Absence de triche et équité entre les joueurs.
3. Simplicité du modèle de domaine et déterminisme.
4. Tests utiles et maintenables.
5. Accessibilité, lisibilité et qualité de l'expérience.
6. Performance mesurée sur les appareils ciblés.
7. Finition graphique.

Ne sacrifie jamais les cinq premières priorités pour une animation ou un effet
visuel.

## Avant toute tâche

1. Lire `README.md`, ce fichier et les éventuels fichiers `AGENTS.md` plus
   proches du code concerné, puis les documents d'architecture et de pipeline.
2. Examiner la structure réelle du dépôt, les scripts disponibles et l'état Git.
3. Identifier la version de roadmap concernée.
4. Reformuler les critères d'acceptation et les invariants touchés.
5. Repérer les décisions non tranchées. Si l'une d'elles change les règles,
   l'équité, la sécurité ou une API publique, demander une décision avant de
   l'implémenter.
6. Proposer un plan court pour toute modification non triviale.
7. Ne modifier que les fichiers nécessaires et préserver les changements déjà
   présents.


## Périmètre et roadmap

- **Phase 0** : documentation, règles, prototypes et validation de la direction.
- **v1** : jeu solo contre une IA avec compte et base de données.
- **v1.x** : finition et améliorations mesurées.
- **v2** : multijoueur en ligne avec serveur autoritaire.

N'implémente pas une fonctionnalité d'une version ultérieure « au cas où ».
La v1 inclut explicitement l'API, l'authentification, PostgreSQL, le profil, les
préférences et les résultats solo. Elle n'inclut pas le serveur temps réel, le
matchmaking public, le classement compétitif, les amis ou les achats.

## Architecture obligatoire

Les flux logiques cibles sont :

**entrée joueur/IA/réseau → validation → moteur de règles → nouvel état +
événements → présentation**

**requête compte/profil/résultat → validation HTTP → service applicatif →
repository → PostgreSQL**

Les dépendances pointent vers le domaine :

- l'interface React, Phaser, l'IA, le stockage et le réseau peuvent dépendre du
  moteur ;
- le moteur ne dépend d'aucun framework, navigateur, renderer, réseau ou
  stockage ;
- Phaser présente la partie mais ne décide jamais d'une règle ;
- React gère les écrans, menus et contrôles HTML mais ne duplique pas l'état
  métier ;
- l'IA utilise la même API d'actions qu'un humain ;
- les handlers HTTP ne contiennent ni règle métier ni requête SQL directe ;
- les services applicatifs orchestrent authentification, autorisation et
  persistance à travers des repositories ;
- Better Auth reste responsable du cycle de vie des identités et sessions ;
- en v2, le serveur est la seule autorité de l'état officiel.

### API, compte et persistance v1

- Utiliser une API Hono séparée du client React.
- Valider entrées et sorties avec des schémas partagés ; une donnée TypeScript
  non validée n'est pas une donnée fiable à l'exécution.
- Utiliser Better Auth et son plugin `username` pour inscription, connexion,
  session, changement de mot de passe et suppression. Ne pas réimplémenter ces
  primitives.
- L’identité publique est le pseudonyme unique normalisé. Ne jamais ajouter
  d’email à un DTO, un formulaire, un log ou un export ; la colonne technique
  Better Auth reste confinée à l’adaptateur d’authentification.
- Préférer des cookies de session `httpOnly`, `secure` en production et avec une
  politique `sameSite` adaptée. Ne pas stocker de jeton de session dans
  `localStorage`.
- Appliquer l'autorisation dans les services : un utilisateur ne modifie que
  son profil et ne lit que ses préférences, résultats et données privées.
- Borner et vérifier les médias de profil côté serveur : avatars JPEG, PNG ou
  WebP de 1 Mio maximum et signature cohérente avec le type déclaré. Seul le
  propriétaire modifie l’avatar ; sa lecture est une identité de jeu visible
  aux joueurs authentifiés. Bio, compte et historique restent privés.
- Versionner ensemble les écritures de bio et d'avatar avec le verrou optimiste
  du profil. Le pseudonyme de connexion reste géré par Better Auth.
- Utiliser PostgreSQL dès la v1 et Drizzle pour le schéma, les requêtes et les
  migrations versionnées.
- Ne jamais exposer directement les lignes Drizzle : les mapper vers des DTO
  publics.
- Persister uniquement les résultats terminés. Une sauvegarde de partie solo en
  cours nécessite une décision produit distincte.
- Rendre l'écriture d'un résultat idempotente à partir d'un identifiant de
  partie stable.
- Exécuter toute migration sur une base de test réaliste et documenter
  sauvegarde, compatibilité et retour arrière.

### Moteur de règles

- Représenter les phases par une machine à états explicite.
- Utiliser des fonctions pures et des structures immuables lorsque cela reste
  lisible.
- Valider toute action à la frontière du moteur.
- Retourner des erreurs de domaine explicites ; ne pas utiliser d'exception pour
  un refus métier attendu.
- Émettre des événements de domaine pour piloter l'affichage, les replays et le
  réseau.
- Ne jamais lire directement l'heure système ni appeler une source aléatoire
  globale. Injecter horloge et générateur pseudo-aléatoire.
- Une partie terminée est un état terminal.
- Le premier joueur à annoncer alterne à chaque manche ; le joueur qui commence
  la première manche alterne entre deux parties successives.
- Les règles ne doivent dépendre ni de la durée des animations ni du framerate.

### Informations publiques et privées

- Modéliser séparément l'état interne, la vue publique et l'observation privée
  de chaque joueur.
- Ne jamais transmettre ou journaliser le choix caché d'un joueur avant la
  révélation.
- L'IA reçoit seulement l'observation autorisée pour son siège.
- Ne pas conserver un secret dans un store UI partagé, une URL, une télémétrie
  ou un message d'erreur.
- En multijoueur, considérer toutes les données du client comme non fiables.

### IA

- Commencer par une stratégie probabiliste explicable, pas par du machine
  learning.
- Garantir qu'une IA ne produit que des actions légales.
- Rendre tout hasard reproductible avec une graine.
- Faire varier la difficulté par la qualité de l'estimation, la mémoire, le
  bluff et un taux d'erreur contrôlé, jamais par l'accès à une information
  cachée.
- Équilibrer sur des simulations mesurées et conserver les résultats pertinents.
- Séparer la stratégie de décision du moteur de règles.

### Interface et rendu

- Garder les menus, champs, boutons, réglages et annonces importantes dans le
  DOM pour préserver l'accessibilité.
- Réserver Phaser au plateau, aux sprites, aux animations et aux particules.
- Une animation traduit un événement confirmé ; elle ne fait pas avancer
  directement les règles.
- Toute séquence doit pouvoir être accélérée ou passée sans désynchroniser
  l'état.
- Supporter souris, tactile et clavier.
- Respecter `prefers-reduced-motion`. Ne pas réintroduire de son sans nouvelle
  décision produit.
- Ne jamais transmettre une information uniquement par couleur, son ou
  animation.
- Tester les vues ciblées en portrait, paysage et bureau.
- Charger les assets de façon progressive ; mesurer avant d'ajouter une
  optimisation complexe.

### Multijoueur v2

Ces règles s'appliquent seulement lorsqu'une tâche v2 est explicitement ouverte :

- Le serveur valide chaque message, l'identité du siège, la phase, le délai et
  la légalité de l'action.
- Le client envoie des intentions, jamais un état à accepter tel quel.
- Le serveur utilise le moteur partagé pour résoudre la partie.
- Les secrets restent côté serveur jusqu'à l'événement de révélation.
- Reconnexion, idempotence, double soumission, abandon, délai et déconnexion
  font partie des scénarios obligatoires.
- Prévoir une limite de débit et une taille maximale pour les messages.
- Ne pas exposer de trace, jeton, secret ou état privé dans les erreurs et logs.
- Réutiliser PostgreSQL introduit en v1 pour les résultats multijoueurs ; ne pas
  faire de la base l'autorité de l'état temps réel d'une salle.
- Ajouter Redis uniquement lorsqu'une mesure de charge ou une stratégie de
  déploiement multi-instance le justifie.

## Organisation cible

La structure v1 ci-dessous est implémentée. Pour toute évolution, respecter les
frontières décidées dans le README ou documenter leur modification dans un ADR :

```text
apps/
  web/
  api/
  game-server/        # v2 seulement
packages/
  game-core/
  game-ai/
  api-contracts/
  database/
  protocol/           # v2 seulement
  test-support/
docs/
  ARCHITECTURE.md
  pipeline-complete.md
  SPEC_V2.md
  PIPELINE_V2.md
  decisions/
  rules/
```

Le découpage physique peut commencer plus simplement, mais les frontières
logiques restent obligatoires. N'extraire un package que lorsqu'il possède une
responsabilité et une API claires.

## Standards TypeScript

- Activer le mode strict et conserver la vérification des types sans erreur.
- Interdire `any`, sauf justification locale documentée ; préférer `unknown`
  puis valider ou affiner.
- Utiliser `camelCase` pour variables et fonctions, `PascalCase` pour composants
  et types, `UPPER_SNAKE_CASE` uniquement pour de vraies constantes globales.
- Employer l'anglais pour le code, les noms de fichiers et les identifiants.
  L'interface utilisateur et la documentation produit peuvent rester en
  français.
- Préférer les unions discriminées pour états, actions, résultats et événements.
- Éviter les booléens ambigus quand un état métier nommé est plus clair.
- Utiliser `async`/`await` pour les entrées-sorties ; le moteur pur ne fait pas
  d'entrée-sortie.
- Trier les imports selon la configuration du projet.
- Ne pas ajouter de dépendance sans besoin démontré et sans vérifier sa
  maintenance, sa licence, son poids et son impact navigateur.

## Taille et responsabilités des fichiers

- Un fichier a une responsabilité principale.
- Pour le code source, à partir de 300 lignes, envisager activement une
  extraction cohérente.
- Pour le code source, à 800 lignes, refactorer avant d'ajouter davantage de
  comportement, sauf fichier généré ou donnée déclarative justifiée.
- Un document de référence demandé comme source unique, tel que l'architecture
  ou la pipeline complète, peut dépasser ce seuil s'il reste navigable avec des
  titres explicites et sans duplication inutile.
- Ne pas créer de fonctions ou composants génériques avant l'apparition d'un
  véritable usage partagé.
- Préférer une duplication locale évidente à une abstraction prématurée qui
  mélange domaine, rendu et réseau.

## Styles et assets

- Utiliser des variables CSS pour les couleurs, espacements, typographies,
  niveaux de profondeur et durées de mouvement.
- Respecter la direction officielle : fantasy stylisée nordique/médiévale,
  formes massives ou anguleuses, rendu peint à la main et palette cuir, bois,
  parchemin, pierre chaude, bronze et charbon brun. Éviter les accents cyan,
  néon ou science-fiction.
- Utiliser `docs/logo.png` comme référence de marque et **ThreeStone** comme nom
  officiel, sans espace.
- Utiliser des styles locaux aux composants ; réserver les styles globaux au
  reset, aux tokens et aux éléments de base.
- Les styles en ligne sont réservés aux valeurs réellement calculées à
  l'exécution.
- Optimiser les images dans des formats adaptés aux navigateurs ciblés.
- Documenter pour chaque asset sa source, sa licence et les éventuelles
  conditions d'attribution.
- Ne jamais ajouter un asset trouvé sur Internet sans droit d'utilisation clair.
- Pour un asset généré, conserver la provenance et vérifier les conditions
  d'usage applicables.
- Fournir un remplacement ou une dégradation correcte si un asset ne charge pas.

## TDD et intégrité des tests

Les tests sont la vérité externe de la tâche, pas une seconde surface
d'implémentation.

Pour une fonctionnalité ou un bug non trivial :

1. Un passage **spécification** fixe les règles, cas limites et critères
   d'acceptation.
2. Un **auteur de tests** écrit les tests en échec et vérifie qu'ils échouent
   pour la raison attendue.
3. Cette base de tests est verrouillée par un commit ou un diff de référence.
4. Un **agent d'implémentation** travaille dans un worktree séparé, ou avec les
   tests en lecture seule.
5. Un **agent de vérification** contrôle le diff, l'intégrité des tests et toutes
   les commandes qualité.

L'agent d'implémentation ne modifie pas les tests verrouillés, snapshots,
fixtures d'assertion ou helpers d'assertion pour obtenir du vert. Si un test est
incorrect, obsolète, instable ou sous-spécifié, il s'arrête et demande un nouveau
passage de l'auteur de tests.

Pour une petite modification gérée par un seul agent, conserver la même
séquence : écrire ou ajuster le test, constater le rouge, considérer ensuite ce
test comme verrouillé, implémenter, puis vérifier.

### Couverture attendue

- Transitions valides de chaque phase.
- Refus de chaque famille d'action illégale.
- Bornes des réserves, choix et pronostics.
- Manche gagnée, manche sans gagnant et fin de partie.
- Invariants par tests génératifs.
- Déterminisme et légalité de l'IA.
- Absence d'accès de l'IA aux secrets adverses.
- Synchronisation entre domaine et présentation.
- Inscription et connexion par pseudonyme, déconnexion, changement de mot de
  passe, changement de pseudonyme et suppression du compte.
- Bio bornée, avatar valide, concurrence de profil, modification propriétaire
  et lecture authentifiée du média.
- Autorisation et isolation des profils, préférences et résultats.
- Idempotence des résultats et compatibilité des migrations PostgreSQL.
- Parcours clavier, tactile et navigateur.
- En v2 : confidentialité, autorité serveur, reconnexion, double envoi,
  concurrence, délai et abandon.

Un test ne doit pas dépendre d'une temporisation arbitraire, du vrai hasard ou
de l'ordre d'exécution d'un autre test.

## Travail agentique et handoffs

Quand plusieurs agents sont disponibles, séparer les responsabilités sur les
tâches importantes :

- **Agent de cadrage** : clarifie le besoin et met à jour la spécification.
- **Agent auteur de tests** : produit la base rouge sans implémenter la solution.
- **Agent d'implémentation** : modifie le produit sans toucher à la base rouge.
- **Agent reviewer** : recherche régressions, violations d'invariants, fuite
  d'information et dérive de périmètre.
- **Agent de vérification** : exécute les contrôles finaux dans un environnement
  propre.

Chaque handoff précise :

- le périmètre et les fichiers autorisés ;
- les critères d'acceptation ;
- les décisions et hypothèses ;
- les tests ajoutés et leur échec attendu ;
- les commandes déjà exécutées et leurs résultats ;
- les risques ou points restant à trancher.

Deux agents ne doivent pas modifier simultanément le même fichier. Utiliser des
worktrees ou des zones d'écriture distinctes. Un reviewer ne corrige pas
silencieusement ce qu'il trouve : il rapporte d'abord les problèmes avec leur
impact et leur localisation.

## Documentation et décisions

- Maintenir `README.md` lorsqu'une règle, une version ou un choix de stack change.
- Maintenir `docs/ARCHITECTURE.md` lorsqu'une frontière, un flux, un modèle de
  données ou un déploiement change.
- Maintenir `docs/pipeline-complete.md` lorsqu'une fonctionnalité, une dépendance
  ou une porte de livraison change.
- Documenter une règle complexe et ses exemples dans `docs/rules/`.
- Créer un ADR sous `docs/decisions/` pour toute décision structurante difficile
  à inverser : renderer, protocole, persistance, authentification, modèle de
  synchronisation ou changement majeur de stack.
- Un ADR contient le contexte, les options, la décision, ses conséquences et la
  date.
- Ne pas laisser un commentaire `TODO` remplacer une décision ou un ticket.
- La documentation doit décrire le comportement réel, pas une intention
  dépassée.

## Sécurité et confidentialité

- Valider toutes les données aux frontières : UI, stockage, réseau et
  import/export.
- Ne jamais committer de secret, token ou fichier d'environnement sensible.
- Ne pas journaliser choix cachés, corps complets de messages, identifiants
  sensibles ou données d'authentification.
- Protéger les sessions avec des cookies sécurisés et vérifier origine, CSRF et
  politique CORS sur les opérations authentifiées.
- Limiter le débit des créations de compte, connexions, changements de mot de
  passe et autres routes sensibles.
- Minimiser les données personnelles, définir leur rétention et rendre la
  suppression de compte vérifiable.
- Échapper tout contenu fourni par un joueur avant affichage.
- Éviter le HTML injecté ; si son usage est indispensable, le nettoyer avec une
  solution éprouvée.
- Maintenir les dépendances et examiner les alertes sans appliquer aveuglément
  une mise à jour majeure.
- En v2, appliquer authentification, autorisation, limitation de débit et
  validation côté serveur.

## Commandes et vérification

Avant d'exécuter une commande, lire `package.json` et utiliser les scripts réels
du dépôt. Ne pas inventer un nom de script et ne pas changer de gestionnaire de
paquets si un lockfile en impose déjà un.

Le projet expose actuellement :

- `pnpm dev` : client et API en développement ;
- `pnpm check` : format, lint, build, types et suites Vitest ;
- `TEST_DATABASE_URL="<url-base-isolée>" pnpm test:integration` :
  intégration Better Auth et repositories sur PostgreSQL ;
- `pnpm test:e2e` : parcours Chromium, Firefox et WebKit avec l’API ;
- `pnpm test:multiplayer` : serveur autoritaire, reprise et résilience ;
- `pnpm test:load:multiplayer` : 20 salons et 40 connexions ;
- `pnpm audit:security` : avis de production élevés et critiques ;
- `pnpm validate:v2` : toutes les portes locales de la candidate v2 ;
- `pnpm db:generate` et `pnpm db:migrate` : migrations Drizzle ;
- `pnpm build` : builds de production.

Les tests d’intégration exigent une base migrée et isolée. Les parcours
navigateur exigent PostgreSQL ; `docker compose up -d` fournit le service local.
La CI applique les migrations avant les suites.

Pour une modification de code, exécuter au minimum les contrôles ciblés, puis
lint, types, tests et build avant de déclarer la tâche terminée. Pour une
modification visuelle, inspecter également le résultat dans le navigateur aux
tailles d'écran concernées. Pour la documentation seule, vérifier les liens, le
Markdown, la cohérence des termes et le diff.

## Git et respect du travail existant

- Inspecter l'état Git avant toute modification.
- Ne pas écraser ou annuler un changement que tu n'as pas créé.
- Ne pas utiliser de commande Git destructive.
- Ne pas modifier l'historique, committer, pousser, créer une branche ou ouvrir
  une pull request sans demande explicite.
- Garder un diff focalisé ; ne pas mélanger refactor, formatage global et
  fonctionnalité.
- Examiner le diff final, y compris les fichiers non suivis pertinents.

## Definition of Done

Une tâche n'est terminée que lorsque :

- les critères d'acceptation sont satisfaits ;
- le comportement respecte les règles et la version de roadmap ;
- les nouveaux cas sont testés au niveau le plus bas pertinent ;
- les tests verrouillés sont inchangés par l'implémentation ;
- les migrations nécessaires sont versionnées, testées et accompagnées d'une
  stratégie de déploiement ;
- lint, format, types, tests et build applicables réussissent ;
- les parcours visuels ou réseau concernés ont été vérifiés ;
- accessibilité, secret des choix et légalité des actions ont été contrôlés ;
- aucun code mort, log de debug ou dépendance inutile n'a été ajouté ;
- la documentation reflète le résultat ;
- le diff final est compris, minimal et sans changement étranger ;
- le compte rendu mentionne les vérifications effectuées et tout risque restant.

## Interdictions

- Ne pas coder une règle encore ouverte en la présentant comme définitive.
- Ne pas mettre de logique métier dans React, Phaser ou les handlers réseau.
- Ne pas mettre de logique métier ou de requête SQL dans un handler HTTP.
- Ne pas implémenter soi-même mots de passe, sessions ou changement de secret.
- Ne pas stocker de session ou de donnée de jeu secrète dans `localStorage`.
- Ne pas laisser l'IA accéder au choix caché du joueur.
- Ne pas accepter l'état d'un client comme état officiel en multijoueur.
- Ne pas faire dépendre les règles d'une animation, d'un délai réel ou du
  framerate.
- Ne pas désactiver, supprimer ou affaiblir un test pour faire passer le code.
- Ne pas ajouter de télémétrie, paiement, classement compétitif, réseau social
  ou persistance non demandée hors périmètre.
- Ne pas ajouter d'asset sans licence ou provenance claire.
- Ne pas annoncer qu'une tâche est terminée sans preuve de vérification.
