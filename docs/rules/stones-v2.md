# Stones — cote de duel de ThreeStone

Statut : règle v2 validée par la décision produit du 31 juillet 2026.

## Intention

Les **Stones** représentent la valeur d’un joueur dans les duels multijoueurs
autoritaires. Le système s’inspire de l’Elo des échecs, tout en donnant
davantage de poids à une victoire rapide. Ce n’est ni un niveau d’expérience,
ni une somme de victoires : battre un adversaire mieux coté rapporte plus que
battre un adversaire moins coté.

Les parties solo sont visibles dans le Journal de jeu et comptent dans
« Parties jouées », mais elles ne modifient jamais les Stones car leur résultat
est produit dans le navigateur.

## Valeur initiale

Tout joueur commence à **0 Stone**.

Les Stones sont un entier sans plafond ni plancher. Une valeur négative est
normale : elle permet à une défaite de conserver un effet dès la première
partie et maintient chaque duel à somme nulle.

## Calcul

Pour un vainqueur possédant `Sw` Stones, un perdant possédant `Sl` Stones et un
duel terminé en `m` manches :

```text
Ew = 1 / (1 + 10 ^ ((Sl - Sw) / 400))
K(m) = clamp(round(144 / m), 12, 48)
Δ = max(1, round(K(m) × (1 - Ew)))
```

Après le duel :

```text
Stones du vainqueur = Sw + Δ
Stones du perdant   = Sl - Δ
```

Le transfert est donc à somme nulle. Une même partie crée exactement le même
gain et la même perte.

## Influence du nombre de manches

À nombre de Stones égal, le coefficient et le transfert sont :

| Manches | Coefficient K | Gain / perte |
| ---: | ---: | ---: |
| 1 à 3 | 48 | 24 |
| 4 | 36 | 18 |
| 5 | 29 | 15 |
| 6 | 24 | 12 |
| 8 | 18 | 9 |
| 10 | 14 | 7 |
| 12 ou plus | 12 | 6 |

La différence de Stones entre les adversaires modifie ensuite ce transfert :
une victoire surprise rapporte davantage, une victoire attendue rapporte
moins.

## Fins anormales

- une défaite par abandon, délai ou déconnexion est cotée comme une défaite
  normale ;
- si aucune manche complète n’existe, le calcul utilise une manche et applique
  donc l’impact maximal ;
- une partie annulée sans gagnant ne modifie aucune Stone ;
- un crash qui annule la salle ne modifie aucune Stone.

## Persistance et idempotence

Le résultat, le transcript, le total courant des deux joueurs et les valeurs
`avant / variation / après` sont écrits dans une seule transaction PostgreSQL.
Rejouer l’écriture avec le même `gameId` ne réapplique jamais le transfert.

La migration depuis l’ancien nom « Renom » soustrait 1 000 aux valeurs
existantes afin de conserver les écarts et les variations tout en ramenant le
point de départ historique à zéro.

## Présentation

Le profil affiche uniquement :

- le nombre total de parties terminées, solo et multijoueur confondus ;
- les Stones, visuellement prioritaires et accompagnées de leur emblème.

Le Journal de jeu fusionne les deux modes par date décroissante. Chaque duel
privé nomme l’adversaire, affiche la variation de Stones et permet d’ouvrir le
transcript des manches. Le taux de victoire et le compteur de victoires ne font
plus partie des statistiques de profil.
