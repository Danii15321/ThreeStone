# ADR-0014 — Déploiement Vercel de la v1

- Statut : accepté
- Date : 2026-07-30
- Version cible : v1
- Remplace : les détails d'hébergement conteneurisé de l'ADR-0010

## Contexte

L'ADR-0010 impose une origine HTTPS unique, des assets statiques sur CDN, une
API Node sans état local durable et PostgreSQL managé. Le fournisseur restait à
choisir. La v1 doit maintenant être publiée sur Vercel sans séparer les cookies,
le client et l'API sur plusieurs domaines.

## Décision

- Un projet Vercel racine unique sert le build Vite et l'API sous la même
  origine.
- Les routes SPA servent `apps/web/dist/index.html`; les assets versionnés sont
  mis en cache de manière immuable.
- Toutes les routes `/api/*` convergent vers une fonction Node Vercel unique qui
  adapte la requête Web Standard à l'application Hono existante.
- Le code métier, les services et les repositories restent indépendants de
  Vercel. Seul l'adaptateur `api/index.mjs` dépend de la topologie de la
  plateforme.
- PostgreSQL est fourni par Neon via le Marketplace Vercel, sur une ressource
  européenne. L'application utilise l'URL poolée avec un maximum d'une
  connexion par instance ; les migrations utilisent l'URL non poolée.
- Les secrets Better Auth de production et de preview sont distincts et
  injectés par Vercel. Ils ne sont jamais copiés dans le dépôt.
- En production, Better Auth et CORS utilisent
  `VERCEL_PROJECT_PRODUCTION_URL`. Une preview utilise son propre `VERCEL_URL`.
- Les migrations ne s'exécutent jamais au démarrage d'une fonction. Le script
  `scripts/migrate-vercel-production.sh` les applique explicitement avant le
  déploiement.

## Livraison

1. exécuter `pnpm check` et le build Vercel local ;
2. sauvegarder la base dès qu'elle contient des données utiles ;
3. récupérer les variables de production avec `vercel pull` ;
4. appliquer les migrations avec `scripts/migrate-vercel-production.sh` ;
5. publier l'artefact Vercel en production ;
6. vérifier la page d'accueil, `/api/health/live`, `/api/health/ready` et un
   parcours de compte ;
7. observer les erreurs et revenir au déploiement Vercel précédent si les seuils
   sont dépassés.

## Conséquences

- La v1 conserve une origine unique et des cookies same-site.
- L'image OCI prévue par l'ADR-0010 n'est pas un artefact de la v1 hébergée sur
  Vercel ; elle pourra être réintroduite si l'API migre vers un hébergeur de
  conteneurs.
- Le pool PostgreSQL doit rester volontairement petit afin de ne pas multiplier
  les connexions lors de l'élasticité des fonctions.
- Les limitations en mémoire restent une protection locale par instance. Une
  limitation distribuée devra être ajoutée avant une montée en charge ou une
  exposition abusive observée.
- La v2 temps réel devra décider séparément où exécuter Colyseus ; elle n'est pas
  implicitement couverte par cette décision v1.
