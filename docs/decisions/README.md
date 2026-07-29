# Architecture Decision Records

Les décisions structurantes de la v1 sont consignées ici. Elles complètent
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) et priment sur une recommandation
antérieure devenue contradictoire jusqu'à la prochaine mise en cohérence des
documents de référence.

Chaque ADR précisera le contexte, les options, la décision, les conséquences et
la date.

## ADR v1 acceptés

1. [`ADR-0001`](./ADR-0001-stack-web-renderer.md) — stack web et renderer ;
2. [`ADR-0002`](./ADR-0002-authentification-cycle-compte.md) —
   authentification, cycle du compte et pseudonyme ;
3. [`ADR-0003`](./ADR-0003-postgresql-drizzle-migrations.md) — PostgreSQL,
   Drizzle et migrations ;
4. [`ADR-0004`](./ADR-0004-etat-public-prive-determinisme.md) — état public,
   observations privées et déterminisme ;
5. [`ADR-0005`](./ADR-0005-email-retention-minimisation.md) — email,
   minimisation, rétention et suppression ;
6. [`ADR-0010`](./ADR-0010-topologie-deploiement-v1.md) — topologie de
   déploiement v1 ;
7. [`ADR-0011`](./ADR-0011-budgets-visuels-performance.md) — budgets visuels,
   accessibilité et performance ;
8. [`ADR-0012`](./ADR-0012-authentification-par-pseudonyme.md) —
   authentification par pseudonyme, sans email ;
9. [`ADR-0013`](./ADR-0013-profil-bio-avatar.md) — bio, avatar et présentation
   du profil v1.
10. [`ADR-0014`](./ADR-0014-deploiement-vercel-v1.md) — déploiement Vercel,
    fonction Hono et PostgreSQL Neon pour la v1.

Les numéros `0006` à `0009` restent réservés aux décisions v2 déjà annoncées
dans l’architecture. L’ADR-0012 est la décision courante pour
l’authentification ; les ADR-0002 et ADR-0005 conservent l’historique remplacé.
L’ADR-0014 précise le fournisseur et remplace les détails conteneurisés de
l’ADR-0010 sans changer son exigence d’origine unique.
