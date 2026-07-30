# Dossier de validation v2

## Décision attendue

Ce document présente la candidate locale du multijoueur privé. Il permet au
propriétaire de décider séparément :

1. si le code peut être poussé ;
2. si un staging peut être créé ;
3. si, après validation du staging, la production peut être déployée.

En l’absence de ces validations explicites, les trois actions restent
interdites.

## État des lots

| Lot | État local | Preuve principale |
| --- | --- | --- |
| V2-00 | Validé | décisions, baseline et topologie figées |
| V2-01 | Validé | domaine déterministe et transcript |
| V2-02 | Validé | protocole `2.0` et projections confidentielles |
| V2-03 | Validé | migration `0004`, baux et persistance idempotente |
| V2-04 | Validé | salle Colyseus autoritaire à deux clients |
| V2-05 | Validé | admission API, codes privés et tickets anti-rejeu |
| V2-06 | Validé | parcours web à deux navigateurs |
| V2-07 | Validé | délais, reprise directe et pannes maîtrisées |
| V2-08 | Validé | revanche, score, réactions et historique |
| V2-09 | Validé | sécurité, accessibilité, résilience et charge |
| V2-10 | Prêt localement | runbook, commandes et rollback ; staging/production non exécutés |

## Historique local

| Lot | Commit local |
| --- | --- |
| Documentation et décisions | `4557e5b` |
| Domaine multijoueur | `ec7d886` |
| Protocole privé | `9bf9717` |
| Persistance et baux | `2a67352` |
| Serveur autoritaire | `32af488` |
| Admission sécurisée | `dead9d1` |
| Parcours web | `78d9ddc` |
| Délais et reconnexion | `54e7bff` |
| Revanche et historique | `1fdce29` |
| Durcissement | `c680b90` |
| Candidat d’exploitation | à renseigner après le commit local final |

Ces commits n’ont pas été poussés.

## Preuves TDD

Les comportements ont été introduits par des tests observés en échec, puis
rendus verts. Les principaux rouges consignés sont :

- transitions multijoueurs, double expiration et transcript absents ;
- projection adverse exposant une forme de secret ;
- repositories, baux et migration multijoueurs absents ;
- salle Colyseus, tickets, admission et anti-rejeu absents ;
- parcours à deux navigateurs et reprise directe absents ;
- délai initialement avantageux lors d’une déconnexion ;
- revanche, score, réactions et historique absents ;
- limites de trame, origine, drainage, métriques et reprise de persistance
  absents ;
- débordements au zoom 200 % et en portrait ;
- port d’hébergement `PORT` ignoré avant la préparation de release.

Chaque rouge a échoué pour la raison attendue avant le correctif correspondant.

## Résultats de contrôle

### Qualité générale

- `pnpm check` : vert.
- Build de tous les workspaces : vert.
- TypeScript strict et lint : verts.
- Tests rapides : verts.

### PostgreSQL réel

- API, Better Auth et repositories : 63 tests verts.
- Intégration du package database : 4 tests verts.
- Total PostgreSQL : 67 tests verts.
- Migration testée depuis une base vide et sur le schéma v1.

### Multijoueur et charge

- Game-server après préparation d’hébergement : 45 tests verts.
- Deux clients programmatiques terminent une partie autoritaire.
- La reprise, les générations, les échéances et la perte de bail sont testées.
- 20 salons et 40 connexions simultanées : vert.
- 60 commandes représentatives sans fuite inter-salon.
- Latence p95 exigée : moins de 500 ms.

### Navigateur et accessibilité

- 15 parcours Playwright au total.
- 13 verts et 2 volontairement non applicables hors Chromium pour le scénario
  multijoueur à deux contextes.
- Chromium, Firefox et WebKit couverts.
- Clavier, mouvement réduit, zoom texte 200 %, bureau et portrait 390 px
  couverts.
- Aucun débordement bloquant ni action masquée sur le parcours critique.

### Sécurité

Audit formel de la révision `c680b90abdbb666674c5f18480c5e5dc93e692b7` :

- 234 fichiers suivis examinés ;
- couverture complète ;
- 5 hypothèses validées puis rejetées ou classées non applicables ;
- 0 vulnérabilité publiable ;
- 0 vulnérabilité élevée ou critique ;
- aucun secret détecté dans les sources suivies ;
- aucun sink HTML dynamique ou exécution de commande première partie ;
- un avis modéré esbuild limité au serveur de développement transitoire.

Le rapport canonique local est généré sous :

```text
/tmp/codex-security-scans/three-stone-game/c680b90_20260730T231600Z/report.md
```

Le dernier diff d’exploitation ne change pas une frontière d’autorisation :
il ajoute la compatibilité `PORT`, les portes CI et la documentation.

## Invariants démontrés

| Invariant | État |
| --- | --- |
| Serveur seul autoritaire | Prouvé |
| Choix adverse structurellement absent avant révélation | Prouvé |
| Aucun indicateur de soumission adverse | Prouvé |
| Déconnexion sans gain de temps | Prouvé |
| Double timeout déterministe | Prouvé |
| Commande idempotente et ordonnée | Prouvé |
| Un compte dans un seul salon actif | Prouvé |
| Reprise sans dépendre de l’API | Prouvé |
| Résultat écrit une seule fois | Prouvé |
| Crash sans faux gagnant | Prouvé |
| Historique limité aux participants | Prouvé |
| Drainage avec annulation sans résultat | Prouvé |
| Charge initiale de 20 salons | Prouvé |

## Éléments à valider manuellement

Avant d’autoriser un push, vérifier localement :

1. création de deux comptes de test ;
2. salon créé dans un navigateur et rejoint dans un second ;
3. manche complète sans fuite du choix caché ;
4. coupure puis reprise réseau ;
5. fin de partie, couronne, revanche et score de session ;
6. historique visible dans Mon compte ;
7. expérience mobile et clavier satisfaisante.

Avant d’autoriser la production, exécuter tout le scénario staging de
[`OPERATIONS_V2.md`](./OPERATIONS_V2.md).

## Risques acceptables mais ouverts

- L’unique instance ne permet pas de reprendre une salle après son crash.
- La nouvelle tentative d’écriture terminale n’est pas durable hors processus.
- Aucun replay public ou journal de commandes en cours.
- L’avis modéré du tooling esbuild dépend d’une mise à jour amont.
- Le chunk Phaser reste volumineux ; il est chargé pour le plateau et constitue
  un travail de performance futur, pas un blocage multijoueur.
- La preuve cloud, le drainage réel et le rollback réel restent impossibles
  avant autorisation d’un staging.

## Critère de passage

Le candidat peut être poussé seulement après une réponse explicite du
propriétaire. Cette validation du push n’autorise pas automatiquement le
staging ou la production.
