# Consignes des agents — ThreeStone

## Mission et périmètre

Construire un jeu juste, déterministe, testable et accessible. Priorités : règles
et confidentialité, équité, simplicité, tests, expérience, performance, finition.
Le comportement et les fonctionnalités livrées sont décrits dans `README.md`.
Ne pas anticiper une fonctionnalité ni trancher seul une règle, une question de
sécurité ou un changement d'API publique encore ouvert.

Avant d'agir, lire le README, ce fichier, les `AGENTS.md` du périmètre et les
consignes de `.agents/` s'il existe. Examiner Git, les fichiers et les scripts
réels de `package.json`, puis préciser critères d'acceptation, invariants touchés
et plan court pour une tâche non triviale.

## Collaboration

Pour les tâches importantes, répartir les responsabilités entre agents :

1. **Cadrage** : besoin, règles, cas limites et critères d'acceptation.
2. **Tests** : écrire les tests, constater leur échec attendu et verrouiller la
   base par un diff de référence ou un commit autorisé.
3. **Implémentation** : modifier le produit dans un périmètre distinct, avec les
   tests verrouillés en lecture seule.
4. **Revue** : signaler régressions, fuites et dérives sans corriger silencieusement.
5. **Vérification** : contrôler le diff, l'intégrité des tests et les résultats.

Un seul agent suit la même séquence pour une petite modification. Un test
incorrect revient à son auteur ; ne jamais affaiblir tests, snapshots ou fixtures
pour obtenir du vert. Les tests ne dépendent ni du vrai hasard, ni de délais
arbitraires, ni de leur ordre d'exécution.

Chaque transmission précise périmètre, fichiers autorisés, critères, hypothèses,
tests et résultats, risques restants. Deux agents ne modifient pas simultanément
le même fichier ; utiliser des zones distinctes ou des worktrees.

## Frontières techniques

- **Jeu** : entrée → validation → moteur → état et événements → présentation.
  Le moteur est pur, indépendant des frameworks, du navigateur et du stockage.
  Phases explicites, actions validées, refus métier explicites, état final terminal.
  Injecter horloge et hasard ; aucune règle ne dépend des animations ou du framerate.
- **IA** : même API d'actions que le joueur, actions légales, stratégie probabiliste
  séparée et reproductible. La difficulté varie par estimation, mémoire, bluff et
  erreur contrôlée ; mesurer l'équilibre par simulation.
- **Confidentialité** : séparer état interne, vue publique et observation privée.
  L'IA ne reçoit que son observation ; aucun choix adverse avant révélation.
  Aucun secret dans un store UI partagé, une URL, un log ou une télémétrie.
- **Interface** : React porte les contrôles HTML accessibles, Phaser le plateau.
  Aucun état métier dupliqué ni règle dans la présentation. Une animation traduit
  un événement confirmé et peut être accélérée ou passée sans désynchronisation.
- **API** : validation HTTP → service applicatif → repository → PostgreSQL.
  Hono reste séparé du client ; pas de SQL ni de règle métier dans les handlers.
  Valider entrées et sorties avec les schémas partagés et exposer des DTO, jamais
  les lignes Drizzle directement.
- **Multijoueur** : le serveur valide identité, siège, phase, délai et action avec
  le moteur partagé. Le client envoie des intentions, jamais un état officiel.
  Borner débit et taille des messages ; vérifier reconnexion, double envoi,
  concurrence, délai, abandon et déconnexion. PostgreSQL stocke les résultats,
  pas l'état temps réel ; Redis exige un besoin mesuré.

## Comptes et données

- Better Auth et son plugin `username` gèrent identités, sessions et mots de passe.
  Pseudonyme normalisé comme identité publique ; l'email technique reste dans
  l'adaptateur, jamais dans un DTO, formulaire, log ou export.
- Cookies `httpOnly`, `secure` en production, `sameSite` adapté ; vérifier origine,
  CSRF et CORS. Aucune session ni donnée de jeu secrète dans `localStorage`.
  Limiter les routes sensibles.
- Autorisation dans les services : profil modifiable par son propriétaire,
  préférences, bio et historique privés. Avatars lisibles par les joueurs
  authentifiés, modifiables seulement par leur propriétaire.
- Avatars JPEG/PNG/WebP de 1 Mio maximum, signature vérifiée côté serveur.
  Bio bornée ; bio et avatar partagent le verrou optimiste du profil.
- PostgreSQL et Drizzle, migrations versionnées et testées sur une base isolée
  réaliste ; préciser sauvegarde, compatibilité et retour arrière avant déploiement.
- Enregistrer uniquement les parties terminées, de façon idempotente avec un
  identifiant stable. Sauvegarder une partie solo en cours exige une décision produit.
- Minimiser les données et leur rétention ; vérifier suppression et isolation des
  comptes. Ne jamais committer de secrets ni journaliser données d'authentification,
  corps complets de messages ou informations privées. Échapper les contenus joueurs.

## Code et expérience

- TypeScript strict, `unknown` affiné plutôt que `any` ; unions discriminées pour
  états et résultats. Code et identifiants en anglais, interface en français.
  Respecter les conventions et imports du dépôt ; `async`/`await` pour les E/S.
- Une responsabilité par fichier ; envisager une extraction dès 300 lignes,
  refactorer avant d'étendre un fichier de 800 lignes sauf génération ou données
  déclaratives justifiées. Éviter abstractions et dépendances sans besoin réel.
- Avant une dépendance, vérifier maintenance, licence, poids et impact navigateur.
  Examiner les alertes sans appliquer aveuglément une mise à jour majeure.
- Souris, tactile, clavier, portrait, paysage et bureau ; respecter la réduction
  des mouvements. Aucune information uniquement par couleur, son ou animation.
  Ne pas réintroduire d'audio sans décision produit.
- CSS local, tokens partagés, styles en ligne seulement pour des valeurs calculées.
  Direction fantasy nordique/médiévale : bois, cuir, parchemin, bronze, pierre,
  charbon brun ; pas de néon/cyan. Nom officiel **ThreeStone**, logo `docs/logo.png`.
- Assets optimisés et chargés progressivement, dégradation correcte si absents.
  Conserver provenance, droits et attribution dans le README ; aucune licence
  inventée ni image sans droit d'utilisation établi.

## Vérification et livraison

Utiliser pnpm et les scripts du dépôt :

| Contrôle                                    | Commande                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| Format, lint, build, types, tests unitaires | `pnpm check`                                           |
| Intégration PostgreSQL et comptes           | `pnpm test:integration`                                |
| Parcours Chromium, Firefox et WebKit        | `pnpm test:e2e`                                        |
| Serveur multijoueur / charge                | `pnpm test:multiplayer` / `pnpm test:load:multiplayer` |
| Dépendances de production                   | `pnpm audit:security`                                  |
| Ensemble des portes v2                      | `pnpm validate:v2`                                     |
| Migrations                                  | `pnpm db:generate` / `pnpm db:migrate`                 |

L'intégration exige `TEST_DATABASE_URL` vers une base isolée et migrée ; les
parcours navigateur nécessitent PostgreSQL. Pour du code, commencer par les tests
ciblés puis exécuter `pnpm check` et les suites concernées. Couvrir transitions,
actions illégales, bornes, fin de partie, invariants génératifs, déterminisme,
confidentialité, autorisation, concurrence et idempotence. Vérifier les parcours
visuels aux tailles ciblées et le réseau si concernés.
Pour de la documentation seule, vérifier Markdown, liens, cohérence et diff.

Préserver le travail existant ; aucune commande Git destructive, modification
d'historique, branche, commit, push ou PR sans demande explicite. Garder le diff
focalisé et examiner aussi les fichiers non suivis pertinents.

La tâche est terminée quand les critères sont satisfaits, les contrôles applicables
passent, les tests verrouillés sont intacts et le diff ne contient ni secret,
code mort, log de debug ni changement étranger. Rapporter preuves et limites réelles.

## Documentation minimale

`README.md` est l'unique documentation du projet : jeu, règles, lien, stack,
fonctionnalités, limites et provenance des visuels. Ce fichier et `.agents/`
conservent seulement les consignes de travail. Ne pas recréer de fichiers de
décisions, d'architecture, de pipeline, de suivi ou de validation sans demande
explicite. Garder les détails vérifiables dans le code et les tests, et les preuves
d'exécution dans le compte rendu de la tâche.
