# Repositories v1

Les repositories Drizzle implémentent les ports des services applicatifs :

- `DrizzlePlayerRepository` isole profil et préférences par identifiant issu de
  la session ;
- `DrizzleSoloResultRepository` écrit uniquement un résultat terminal validé,
  dans une transaction avec ses deux participants ;
- l’identifiant UUID de partie est globalement unique ;
- un retry identique retourne le résultat existant ;
- une réutilisation contradictoire du même UUID est refusée sans révéler le
  propriétaire éventuel ;
- historique et statistiques filtrent toujours l’utilisateur authentifié.

Les lignes Drizzle sont remappées et validées par les schémas publics avant de
sortir du repository.
