# Spécification fonctionnelle et technique — ThreeStone v2 multijoueur

- Statut : proposition révisée
- Version du document : `0.2.0`
- Version produit cible : `v2`
- Version des règles : `1.0.0`
- Version initiale du protocole : `2.0`
- Date : 2026-07-30

## 1. Objet

Cette spécification définit une **v2 livrable** du mode multijoueur privé de
ThreeStone. Elle décrit les comportements observables, les règles d’autorité,
les informations publiques et privées, la reconnexion, la persistance et les
preuves minimales attendues avant livraison.

Les mots **doit**, **refuse** et **ne doit jamais** sont normatifs. Une
divergence avec ce document exige soit sa modification explicite, soit un ADR
si elle change une frontière d’architecture.

Documents de référence :

- [`../README.md`](../README.md) : vision et roadmap ;
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) : frontières techniques ;
- [`PIPELINE_V2.md`](./PIPELINE_V2.md) : ordre de réalisation de la v2 ;
- [`rules/game-rules-v1.md`](./rules/game-rules-v1.md) : règles du jeu ;
- [`rules/account-and-data-v1.md`](./rules/account-and-data-v1.md) : compte et
  données ;
- [`../AGENTS.md`](../AGENTS.md) : standards de développement.

En cas de divergence, cette spécification prévaut uniquement pour le mode
multijoueur v2. Les règles de jeu restent communes aux modes solo et
multijoueur.

## 2. Résultat produit attendu

Deux personnes authentifiées doivent pouvoir :

1. créer ou rejoindre un salon privé avec un code d’invitation ;
2. vérifier l’identité visuelle de l’adversaire ;
3. jouer une partie dont le serveur est l’unique autorité ;
4. perdre normalement en cas d’abandon ou de délai dépassé ;
5. reprendre leur siège après une coupure réseau raisonnable ;
6. consulter le détail des manches après la partie ;
7. demander une revanche sans recréer le salon ;
8. voir le score de leur session, par exemple `2 – 1` ;
9. envoyer quelques réactions prédéfinies sans ouvrir un canal de discussion.

### 2.1 Inclus dans la v2

- salons privés de deux joueurs ;
- présence, état prêt et lancement synchronisé ;
- gameplay complet selon les règles `1.0.0` ;
- délais, abandon, déconnexion et reconnexion ;
- score de session non classé et non persistant ;
- réactions prédéfinies ;
- historique persistant et transcript validé des manches ;
- récapitulatif ou replay privé aux participants ;
- accessibilité clavier, lecteur d’écran et mouvement réduit ;
- exploitation initiale sur une seule instance de serveur de jeu.

### 2.2 Hors périmètre

- matchmaking public ;
- classement, Elo, ligues, saisons ou récompenses ;
- liste d’amis ;
- chat libre, messages privés ou vocal ;
- spectateurs et replay public ;
- achats, monnaie ou inventaire ;
- tournoi ;
- migration transparente d’une partie active entre deux instances ;
- anti-triche comportemental fondé sur l’apprentissage automatique.

## 3. Principes non négociables

1. Le client envoie des **intentions**, jamais un nouvel état de partie.
2. Le serveur de jeu valide et applique toutes les commandes.
3. Un secret adverse est structurellement absent des messages reçus par le
   client, et non présent avec la valeur `undefined` ou `null`.
4. Une déconnexion ne donne jamais plus de temps au joueur qui doit agir.
5. Un résultat terminal n’est persisté qu’une fois.
6. Un crash n’invente ni gagnant, ni défaite.
7. Un compte ne peut occuper qu’un salon actif, grâce à un bail expirant.
8. Les tickets, codes et secrets ne figurent jamais dans une URL ou un log.
9. Les transitions critiques sont déterministes et testées avant leur
   implémentation.

## 4. Parcours joueur

### 4.1 Création et invitation

Un joueur authentifié crée un salon. Le système retourne :

- un code court lisible et copiable ;
- une action de partage native si le navigateur le permet ;
- un bouton permettant de quitter le salon.

Le code est composé de caractères non ambigus. Il est valable tant que le
salon attend un adversaire et n’est jamais utilisé comme secret
d’authentification.

Un second joueur saisit le code. Les erreurs « code inconnu », « expiré »,
« salon complet » et « salon non accessible » produisent le même message
public : **Impossible de rejoindre ce salon**.

### 4.2 Salon

Le salon affiche pour chaque siège :

- pseudo ;
- avatar, ou initiale de secours ;
- état connecté ou en reconnexion ;
- état prêt.

Les deux joueurs doivent être prêts. Le serveur lance la partie et attribue
aléatoirement les sièges ainsi que le premier annonçant de la première manche.
Le joueur local reste visuellement à droite sur son propre écran ; cette
projection ne change pas l’identité des sièges serveur.

### 4.3 Partie et manches

Chaque joueur commence avec trois cailloux.

Pour chaque manche :

1. les deux joueurs choisissent secrètement entre zéro et leur réserve ;
2. le premier annonçant pronostique la somme ;
3. le second annonce un pronostic différent ;
4. le serveur révèle les deux choix et calcule la somme ;
5. un joueur dont le pronostic est exact jette un caillou ;
6. si personne n’a trouvé, aucune réserve ne change ;
7. le premier annonçant alterne à la manche suivante.

Un joueur qui atteint zéro caillou gagne la partie. Comme les deux pronostics
doivent être différents, une manche ne peut avoir deux gagnants.

Le client peut anticiper les contrôles disponibles pour le confort, mais le
serveur revérifie toujours :

- phase attendue ;
- siège autorisé ;
- valeur entière dans la plage légale ;
- pronostic distinct ;
- séquence connue ;
- identité et unicité de la commande.

### 4.4 Fin, score de session et revanche

Le salon conserve en mémoire un score de parties, par exemple `2 – 1`.

- une victoire normale, par délai ou par abandon ajoute un point ;
- une annulation technique n’ajoute aucun point ;
- le score survit aux revanches dans le même salon ;
- il disparaît à la fermeture du salon ;
- il n’alimente ni classement ni statistiques globales supplémentaires.

Après la partie, chaque joueur peut consulter les manches et demander une
revanche. Une nouvelle partie commence uniquement si les deux joueurs
acceptent dans les 60 secondes. Le premier annonçant initial est alors celui
qui ne l’était pas dans la partie précédente. À défaut d’accord, le salon se
ferme proprement.

### 4.5 Réactions

La v2 propose uniquement une liste contrôlée, par exemple :

- Bien joué ;
- Joli bluff ;
- Oups ;
- Revanche ?

Une réaction :

- est éphémère et n’est pas persistée ;
- disparaît visuellement après environ trois secondes ;
- possède un équivalent textuel annoncé au lecteur d’écran ;
- ne déclenche aucun son ;
- peut être masquée localement ;
- est limitée à une toutes les deux secondes et trois sur dix secondes.

Le serveur refuse toute valeur absente de la liste. Aucun texte libre n’est
transporté.

## 5. Délais, déconnexion et abandon

Les délais sont calculés avec l’horloge monotone du serveur. L’heure et le
compte à rebours du client sont seulement indicatifs.

Valeurs initiales :

| Situation | Délai |
| --- | ---: |
| Salon vide ou jamais prêt | 5 min |
| Choix caché | 30 s par siège |
| Pronostic | 20 s pour le siège actif |
| Acceptation d’une revanche | 60 s |
| Grâce de reconnexion | 60 s consécutives |
| Budget cumulé de reconnexion | 120 s par siège et par partie |

### 5.1 Règle anti-déconnexion stratégique

Il n’existe pas de pause globale des délais de gameplay.

- Chaque siège qui doit agir possède son propre `actionDeadline`.
- Sa propre déconnexion ne modifie jamais cette échéance.
- La déconnexion d’un siège ne modifie pas l’échéance de l’autre siège.
- Un siège qui n’a aucune action à jouer n’a pas de délai d’action à perdre :
  seule sa grâce de reconnexion s’écoule.
- Si une action devient attendue pendant que le siège est absent, son délai
  commence normalement et s’écoule en parallèle de sa grâce.
- Si le délai d’action expire avant la grâce, la défaite par délai s’applique.
- Si la grâce expire alors qu’aucune action n’était due, la défaite par
  déconnexion s’applique.

La grâce protège donc la continuité de la partie, pas un joueur en retard.
Couper volontairement le réseau n’offre aucun temps de réflexion
supplémentaire.

### 5.2 Résolution atomique du choix simultané

Les deux choix cachés partagent un instant de départ et une échéance serveur.
À cette échéance, le serveur compte atomiquement les choix acceptés **avant**
l’échéance :

| Choix acceptés | Résultat |
| ---: | --- |
| 2 | la partie passe aux pronostics |
| 1 | le siège qui n’a pas soumis perd par délai |
| 0 | la partie est annulée sans gagnant, sans score et sans résultat |

Cette règle prévaut sur l’ordre dans lequel la boucle d’événements traite ses
timers. Une commande reçue après l’échéance est tardive même si le callback du
timer n’a pas encore été exécuté.

Pour un pronostic, un seul siège est actif : son expiration produit une
défaite immédiate.

### 5.3 Connexion et reprise

Une coupure déclenche l’état public **Reconnexion…**. Le siège reste réservé.
À la reprise, le serveur envoie un snapshot courant ; il ne rejoue pas une
suite non fiable de messages manqués.

Une seule connexion peut contrôler un siège. Une nouvelle connexion valide
remplace l’ancienne et incrémente une génération de connexion. Toute commande
de l’ancienne génération est rejetée.

Le bouton **Quitter la partie** demande confirmation. Une confirmation pendant
une partie active constitue un abandon et donne la victoire à l’adversaire.
Fermer un onglet ou perdre le réseau reste une déconnexion, pas un abandon
explicite.

## 6. Autorité et machine d’état

Le serveur de jeu conserve en mémoire l’état actif :

- identifiants du salon, de la session et de la partie ;
- sièges, identités et générations de connexion ;
- phase et numéro de manche ;
- réserves ;
- premier annonçant ;
- choix cachés ;
- pronostics publics ;
- délais ;
- score de session ;
- commandes déjà traitées ;
- jetons de reprise hachés ;
- numéro de séquence.

Phases minimales :

```text
WAITING
  -> READY
  -> HIDDEN_CHOICES
  -> FIRST_PREDICTION
  -> SECOND_PREDICTION
  -> REVEAL
  -> ROUND_RESULT
  -> HIDDEN_CHOICES | GAME_RESULT
  -> REMATCH
  -> READY | CLOSED
```

`CANCELLED` et `CLOSED` sont accessibles depuis toute phase lorsque la cause
technique le justifie.

Chaque mutation acceptée incrémente une séquence strictement croissante. Les
transitions du domaine restent dans `packages/game-core`. Colyseus orchestre
les connexions, les délais et la diffusion, sans dupliquer les règles.

## 7. Projections et confidentialité du jeu caché

Le serveur construit au moins trois projections :

1. snapshot public commun ;
2. observation privée du siège A ;
3. observation privée du siège B.

Le snapshot public peut contenir :

- phase, manche, séquence et délais publics ;
- pseudos, avatars et présence ;
- réserves ;
- premier annonçant ;
- pronostics déjà annoncés ;
- résultat révélé ;
- score de session.

Il ne contient jamais :

- un choix caché non révélé ;
- une borne ou un total permettant de le déduire ;
- une propriété de choix caché avec une valeur vide ;
- l’état de soumission du choix adverse ;
- une taille de message corrélée à la valeur choisie.

L’observation privée ajoute uniquement le choix du siège destinataire, après
son acceptation. L’accusé de réception a une forme et une taille indépendantes
de la valeur. Le passage public aux pronostics révèle seulement que les deux
commandes ont finalement été acceptées.

Les schémas utilisent des unions discriminées par phase. Les tests vérifient
l’absence de propriétés interdites avec `hasOwnProperty`, et pas seulement
leur valeur.

## 8. Protocole temps réel

Tout message client possède l’enveloppe conceptuelle suivante :

```ts
type ClientCommand<T> = {
  protocolVersion: 2;
  type: string;
  commandId: string;
  roomId: string;
  knownSequence: number;
  payload: T;
};
```

Commandes minimales :

- `room.ready` ;
- `round.choose` ;
- `round.predict` ;
- `match.abandon` ;
- `session.rematch` ;
- `session.react`.

Réponses minimales :

- `command.accepted` ;
- `command.rejected` ;
- `room.snapshot` ;
- `room.cancelled`.

Le `commandId` est généré côté client et stable lors d’une nouvelle tentative.
Pour un siège et une partie :

- même identifiant et même contenu : le serveur retourne le résultat initial
  sans réappliquer la commande ;
- même identifiant et contenu différent : rejet `COMMAND_ID_REUSED` ;
- identifiant inconnu : validation normale.

Une séquence trop ancienne provoque un rejet récupérable accompagné d’un
snapshot. Une version de protocole incompatible ferme la connexion avec une
erreur explicite et sans exposer d’information sur le salon.

Les erreurs publiques restent finies, traduisibles et sans détail interne.
Les commandes ont une taille maximale stricte.

## 9. Admission et reprise sans dépendance HTTP

### 9.1 Ticket initial

L’API Hono authentifie le compte, vérifie le bail et délivre un ticket
d’admission à usage unique :

- durée maximale : 45 secondes ;
- portée : compte, salon, siège et action ;
- identifiant aléatoire anti-rejeu ;
- intégrité assurée par un secret partagé entre API et serveur de jeu.

Le ticket est envoyé dans le corps de la requête ou les données de connexion,
jamais dans l’URL. Le serveur le consomme atomiquement à la connexion. Un
second usage échoue.

La v2 initiale n’exige ni JWKS ni rotation dynamique. Le secret est injecté par
l’environnement et sa rotation coordonnée est documentée.

### 9.2 Jeton de reprise directe

Après l’admission, le serveur de jeu émet sur la connexion authentifiée un
jeton opaque de reprise :

- aléatoire et de haute entropie ;
- limité au salon, au siège et à la génération ;
- conservé uniquement en mémoire côté client ;
- stocké haché côté serveur ;
- valable au plus pendant la vie du salon et la grâce de reconnexion ;
- à usage unique et remplacé après chaque reprise.

Une coupure transitoire peut ainsi être reprise directement auprès du serveur
de jeu, même si l’API HTTP est momentanément indisponible.

Une actualisation complète de page, un changement d’appareil ou la perte de la
mémoire du client requiert un nouveau ticket API. Cette voie est un secours,
pas la dépendance de la reprise réseau normale.

Le jeton n’est jamais placé dans une URL, un stockage persistant, un outil
d’analyse ou un log.

## 10. Bail de salon actif

L’unicité « un compte, un salon actif » repose sur un **bail PostgreSQL
expirant**, jamais sur un booléen sans durée.

Schéma conceptuel :

```text
active_multiplayer_lease
  user_id              unique
  room_id
  server_instance_id
  lease_token_hash
  heartbeat_at
  expires_at
```

Règles :

- l’API acquiert ou vérifie le bail dans une transaction avant l’admission ;
- rejoindre à nouveau le même salon est autorisé ;
- rejoindre un autre salon avec un bail valide est refusé ;
- le serveur renouvelle le bail toutes les 30 secondes ;
- la durée du bail est de 120 secondes ;
- fermeture normale : libération conditionnelle par jeton de bail ;
- crash : absence de renouvellement, puis expiration automatique ;
- un ancien serveur ne peut renouveler ou libérer le bail d’un successeur ;
- après perte définitive du bail, le serveur annule le salon avant d’accepter
  une nouvelle commande.

Le bail est une coordination d’admission, pas une copie de l’état de partie.
PostgreSQL ne devient pas le moteur temps réel.

Une panne de base refuse les nouvelles admissions. Les salons actifs disposent
au maximum de la durée du bail pour retrouver le renouvellement ; à défaut,
ils sont annulés sans faux résultat.

## 11. Persistance et reproduction

### 11.1 Ce qui est persisté

À la fin d’une partie, une transaction idempotente persiste :

- identifiant stable de partie ;
- participants et sièges ;
- gagnant et cause terminale ;
- difficulté : non applicable au multijoueur ;
- horodatages et durée ;
- version des règles et du protocole ;
- attribution initiale et graine du moteur ;
- transcript validé des manches.

Chaque ligne de transcript contient au minimum :

- numéro de manche ;
- premier annonçant ;
- choix révélés des deux sièges ;
- pronostics des deux sièges ;
- somme ;
- gagnant éventuel de la manche ;
- réserves après résolution.

La contrainte `(game_id, round_number)` est unique. La partie, les
participants et les manches sont écrits dans la même transaction. Une nouvelle
tentative avec le même `game_id` retourne le résultat déjà persisté.

### 11.2 Portée de la graine

La graine reproduit uniquement les décisions aléatoires du serveur, notamment
l’attribution des sièges et le premier annonçant initial. Elle ne reproduit
jamais les décisions humaines.

La reproduction d’une partie nécessite **la graine et le transcript**. Toute
affirmation selon laquelle la graine seule permet un audit est interdite.

Le transcript n’est pas un journal réseau :

- aucun ticket ou jeton ;
- aucun message brut ;
- aucun délai de réflexion individuel ;
- aucune commande refusée ;
- aucune donnée cachée avant sa révélation normale.

### 11.3 Consultation et suppression

Seuls les deux participants et les opérateurs autorisés peuvent consulter le
transcript. La v2 affiche au minimum un récapitulatif par manche ; un replay
public et le mode spectateur restent exclus.

La suppression d’un compte :

- révoque ses admissions et ferme son siège actif ;
- anonymise son identité dans les résultats partagés conservés par
  l’adversaire ;
- supprime son avatar et sa bio selon les règles v1 ;
- conserve les valeurs de manche nécessaires à l’intégrité du résultat sans
  conserver son pseudo.

Les journaux opérationnels suivent les règles de minimisation et de rétention
de [`ADR-0005`](./decisions/ADR-0005-email-retention-minimisation.md). Ils ne
remplacent jamais le transcript métier.

## 12. Architecture et déploiement initial

Topologie :

```text
Navigateur
  ├─ HTTPS -> Web/API
  └─ WSS   -> Serveur Colyseus

Web/API -> PostgreSQL
Serveur Colyseus -> PostgreSQL
```

- `apps/web` porte l’interface ;
- `apps/api` porte l’authentification, l’admission et l’historique ;
- `apps/game-server` porte les salons Colyseus ;
- `packages/game-core` porte les règles déterministes ;
- `packages/protocol` porte les schémas versionnés.

Le serveur Colyseus doit tourner dans un processus long vivant et ne doit pas
être déployé comme fonction Vercel. La première version utilise une seule
instance ; Redis et le déploiement multi-instance sont reportés jusqu’à ce que
la charge ou la disponibilité les justifie.

Un déploiement planifié :

1. refuse les nouveaux salons ;
2. laisse jusqu’à dix minutes aux salons actifs ;
3. avertit les joueurs ;
4. annule sans résultat les salons encore actifs ;
5. déploie puis exécute un smoke test.

Un crash annule les salons présents uniquement en mémoire. Il ne persiste
jamais un faux gagnant. Les résultats déjà validés en base restent accessibles
et les baux orphelins expirent.

Un seul ADR est bloquant avant le déploiement : choix de l’hébergeur du serveur
long vivant, domaines, TLS, variables secrètes et procédure de retour arrière.

## 13. Sécurité et abus

Mesures minimales :

- HTTPS/WSS uniquement ;
- origine WebSocket contrôlée ;
- cookies de session sécurisés côté HTTP ;
- ticket initial et jeton de reprise jamais dans l’URL ;
- validation stricte de chaque message avec rejet des champs inconnus ;
- taille et fréquence bornées ;
- limitation par compte et IP sur création, saisie de code et ticket ;
- comparaison non bavarde des codes ;
- messages génériques contre l’énumération ;
- secrets, codes, choix non révélés et données d’authentification exclus des
  logs ;
- dépendances auditées par la CI ;
- politique CSP adaptée au WebSocket de production.

Seules les commandes validées modifient l’état. Une réaction hors liste, un
pronostic impossible, une commande pour un autre siège ou une répétition
altérée sont rejetés sans mutation.

## 14. Accessibilité et interface

Toutes les actions doivent fonctionner au clavier et afficher un focus
visible. Le glissement d’un curseur possède des boutons ou touches
équivalentes.

Les phases, tours, délais, pronostics, révélations, résultats, pertes de
connexion et réactions sont exposés en texte. Les régions live évitent les
répétitions ; elles n’annoncent jamais une information secrète ou l’état de
soumission adverse.

La couleur n’est jamais le seul indicateur. Les contrastes visent WCAG AA. Le
mode `prefers-reduced-motion` remplace les mouvements de mains par des
transitions sobres sans retirer l’information. Aucun son n’est requis pour
jouer.

## 15. Observabilité utile

Métriques initiales :

- salons créés, rejoints, terminés et annulés ;
- connexions actives ;
- reprises réussies et échouées par catégorie générique ;
- délais et abandons ;
- latence d’acceptation des commandes ;
- erreurs de persistance ;
- échecs de renouvellement des baux.

Les identifiants techniques sont pseudonymisés. Aucune métrique ne contient la
valeur d’un choix caché, un ticket, un jeton, un code de salon ou le texte
d’une bio.

Les alertes initiales se limitent aux causes qui empêchent de jouer :

- serveur de jeu indisponible ;
- taux anormal d’échec d’admission ;
- renouvellement des baux en échec ;
- persistance terminale en échec.

## 16. Stratégie TDD et preuves

Chaque lot suit `RED -> GREEN -> REFACTOR`. Le test qui exprime une règle doit
échouer avant son implémentation.

### 16.1 Domaine

Tests unitaires obligatoires :

- choix et pronostics légaux ou refusés ;
- alternance du premier annonçant ;
- résolution et victoire ;
- zéro, un ou deux choix reçus à l’échéance commune ;
- commande arrivée exactement avant ou après l’échéance ;
- score de session et absence de point après annulation ;
- transcript identique pour une même suite de commandes.

### 16.2 Protocole et confidentialité

Tests de contrat obligatoires :

- propriété de choix adverse réellement absente ;
- absence de borne dérivée ;
- absence d’indicateur public de soumission adverse ;
- accusé de réception indépendant de la valeur ;
- rejet des champs inconnus et messages trop grands ;
- même `commandId` et même contenu sans double effet ;
- même `commandId` et contenu différent rejeté ;
- version incompatible rejetée.

### 16.3 Intégration

Tests obligatoires :

- création, invitation, prêt, partie et revanche ;
- ticket initial utilisé deux fois ;
- reprise directe alors que l’API est indisponible ;
- remplacement de connexion et rejet de l’ancienne génération ;
- délai du joueur absent continuant pendant sa déconnexion ;
- grâce complète quand aucune action n’est attendue ;
- abandon explicite ;
- acquisition, renouvellement, expiration et concurrence du bail ;
- persistance répétée sans doublon ;
- anonymisation d’un participant supprimé.

### 16.4 Parcours navigateur

Scénarios critiques :

1. deux comptes jouent une partie complète ;
2. le second pronostic ne peut égaler le premier ;
3. un joueur coupe le réseau avec trois secondes restantes et perd après trois
   secondes, pas après la grâce ;
4. les deux joueurs ne choisissent rien et la partie s’annule ;
5. un joueur se reconnecte directement sans API disponible ;
6. une revanche fait évoluer le score de session ;
7. le transcript reproduit les manches ;
8. le parcours est jouable au clavier et avec mouvement réduit.

### 16.5 Charge proportionnée

La porte initiale vérifie **20 salons et 40 connexions simultanées** pendant un
scénario représentatif, avec :

- aucune corruption ou fuite inter-salon ;
- aucune commande perdue silencieusement ;
- latence p95 d’acceptation inférieure à 500 ms dans l’environnement de test.

La capacité maximale observée est documentée, mais 200 salons actifs ne sont
pas une condition de livraison. Une nouvelle cible sera fixée à partir de
l’usage réel.

## 17. Lots de livraison

1. **M2.1 — Domaine et transcript**  
   Machine d’état, délais atomiques, alternance, résultat et transcript.
2. **M2.2 — Protocole privé**  
   Schémas, projections, séquence, idempotence et confidentialité.
3. **M2.3 — Admission et bail**  
   Codes, ticket initial, bail expirant et erreurs génériques.
4. **M2.4 — Salon et gameplay**  
   Connexions, prêt, partie complète, délais et abandon.
5. **M2.5 — Reprise directe**  
   Jeton rotatif, snapshot, générations et budgets de grâce.
6. **M2.6 — Session sociale minimale**  
   Score, revanche et réactions prédéfinies.
7. **M2.7 — Historique**  
   Transaction terminale, récapitulatif et anonymisation.
8. **M2.8 — Qualité et livraison**  
   E2E, accessibilité, charge proportionnée, observabilité et déploiement.

Chaque lot inclut ses tests, sa documentation et les migrations nécessaires.
Les mécanismes multi-instance, le matchmaking et le chat ne doivent pas
s’inviter dans ces lots.

## 18. Critères de livraison

La v2 est livrable lorsque :

- deux comptes jouent le parcours complet sur l’environnement cible ;
- le serveur est autoritaire sur toutes les commandes ;
- les tests de confidentialité prouvent l’absence structurelle des secrets ;
- les délais de déconnexion et le double timeout sont déterministes ;
- la reprise directe fonctionne sans API pour une coupure transitoire ;
- un bail orphelin expire sans intervention manuelle ;
- le résultat et les manches sont persistés une seule fois ;
- le score, la revanche et les réactions fonctionnent ;
- le crash et le déploiement n’inventent pas de gagnant ;
- les scénarios navigateur critiques passent ;
- les seuils de charge proportionnés sont atteints ;
- les instructions d’exploitation et de retour arrière sont documentées.

Une rotation JWKS, une architecture multi-instance, 200 salons ou plusieurs
répétitions de rollback ne sont pas des portes de livraison de cette v2.

## 19. Décision produit à valider — visibilité du temps de choix

Deux politiques cohérentes existent :

### Option A — progression visible

Le snapshot indique quel siège a soumis son choix. Le temps de réflexion
devient volontairement un **tell** de bluff, comparable à l’hésitation autour
d’une table physique. Cette option rend l’attente plus lisible mais révèle une
information comportementale attribuée.

### Option B — progression privée, recommandée

Chaque joueur reçoit seulement l’accusé de réception de son propre choix.
L’adversaire ne sait pas qui a soumis ; il voit uniquement le passage de phase
quand les deux choix sont acceptés. Cette option protège mieux l’équité et
reste cohérente avec l’attention portée aux canaux auxiliaires.

La présente spécification est écrite selon **l’option B**. Valider l’option A
nécessite de modifier les sections 7, 14 et les tests de contrat, mais ne
change pas l’architecture.

## 20. Synthèse des corrections apportées

Cette révision :

- supprime le gain stratégique procuré par une déconnexion ;
- définit le cas où aucun choix n’arrive à l’échéance commune ;
- limite honnêtement la portée de la graine et persiste les manches ;
- traite explicitement le temps de réflexion comme une décision produit ;
- remplace le verrou de partie active par un bail expirant ;
- découple la reprise réseau normale de la disponibilité de l’API ;
- ajoute un score de session et des réactions contrôlées ;
- ramène les preuves de charge et d’exploitation à l’échelle du produit.
