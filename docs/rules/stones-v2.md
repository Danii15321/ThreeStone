# Stones — cote de duel de ThreeStone

Statut : règle v2 enrichie par la décision produit du 2 août 2026.

## Intention

Les **Stones** représentent la valeur d’un joueur dans les duels multijoueurs
autoritaires. Le système s’inspire de l’Elo des échecs, tout en donnant
davantage de poids à une victoire rapide et à trois accomplissements vérifiés
pendant le duel. Ce n’est ni un niveau d’expérience, ni une somme de victoires :
battre un adversaire mieux coté rapporte plus que battre un adversaire moins
coté.

Les parties solo sont visibles dans le Journal de jeu et comptent dans
« Parties jouées », mais elles ne modifient jamais les Stones car leur résultat
est produit dans le navigateur.

## Valeur initiale

Tout joueur commence à **0 Stone**.

Les Stones sont un entier sans plafond ni plancher. Une valeur négative est
normale : elle permet à une défaite de conserver un effet dès la première
partie.

## Transfert lié au résultat

Pour un vainqueur possédant `Sw` Stones, un perdant possédant `Sl` Stones et un
duel terminé en `m` manches :

```text
Ew = 1 / (1 + 10 ^ ((Sl - Sw) / 400))
K(m) = clamp(round(144 / m), 12, 48)
Δ = max(1, round(K(m) × (1 - Ew)))
```

Le transfert de résultat est :

```text
base du vainqueur = +Δ
base du perdant   = -Δ
```

Cette base est à somme nulle. Une victoire surprise rapporte davantage, une
victoire attendue rapporte moins.

### Influence du nombre de manches

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

## Récompenses de pierre

Les récompenses sont calculées uniquement par le serveur depuis les manches
révélées du transcript autoritaire. Elles sont cumulables entre elles et avec
le transfert du résultat.

| Récompense | Condition | Valeur | Plafond par duel |
| --- | --- | ---: | ---: |
| Main de pierre | gagner une manche en ayant caché zéro caillou | +3 | 4 occurrences |
| Œil en pierre | réussir trois pronostics exacts pendant trois manches consécutives ; une manche sans réussite casse la série | +9 | 1 |
| Cœur de pierre | gagner normalement après avoir été exactement mené avec 3 cailloux restants contre 1 pour l’adversaire à la fin d’une manche antérieure | +6 | 1 |

Avec les règles actuelles et trois cailloux initiaux, une partie ne permet
naturellement que trois Mains de pierre. Le plafond explicite de quatre reste
normatif pour préserver le barème si la réserve initiale évolue un jour.

Le Cœur de pierre exige une fin normale par réserve vide. Une victoire par
abandon, délai ou déconnexion ne le déclenche jamais. Main de pierre et Œil en
pierre restent acquis depuis les manches déjà résolues même si leur auteur perd
ensuite la partie.

Pour chaque joueur `i` :

```text
bonus(i) = 3 × mainsDePierre(i) + 9 × oeilDePierre(i) + 6 × coeurDePierre(i)
variationNette(gagnant) = +Δ + bonus(gagnant)
variationNette(perdant) = -Δ + bonus(perdant)
Stones après = Stones avant + variationNette
```

Les récompenses personnelles créent des Stones supplémentaires : le calcul
complet n’est donc plus à somme nulle et un joueur battu peut finir avec une
variation nette positive.

## Classes

La classe est une projection pure des Stones courantes et n’est jamais
persistée séparément :

| Classe | Stones |
| --- | ---: |
| B | moins de 100 |
| A | de 100 à 499 |
| S | 500 ou plus |

Les bornes `100` et `500` appartiennent respectivement aux classes A et S.

## Protection contre les duels arrangés

Une paire non ordonnée de comptes peut jouer au maximum cinq duels cotés dans
une fenêtre glissante de 24 heures. À partir du sixième duel, la partie reste
jouable et persistée mais devient **amicale** : aucun transfert, aucune
récompense et aucune évolution de classe ne sont appliqués.

Le caractère coté ou amical est décidé dans la transaction de résultat, sous
les mêmes verrous que les deux projections de Stones. Un retry avec le même
`gameId` restitue toujours la décision et le détail déjà persistés.

## Fins anormales

- une défaite par abandon, délai ou déconnexion conserve le transfert de base
  prévu par la formule ;
- aucune récompense ne provient d’une manche incomplète ;
- Cœur de pierre est réservé à une victoire normale par réserve vide ;
- une partie annulée sans gagnant ne modifie aucune Stone ;
- un crash qui annule la salle ne modifie aucune Stone.

## Persistance et idempotence

Le résultat, le transcript, le caractère coté, les récompenses, le total
courant des deux joueurs et les valeurs `avant / base / bonus / variation /
après` sont écrits dans une seule transaction PostgreSQL. Rejouer l’écriture
avec le même `gameId` ne réapplique jamais le calcul.

Les parties terminées avant l’activation de cette règle conservent leur Stones
et ne reçoivent aucune récompense rétroactive.

## Présentation

Le profil affiche :

- le nombre total de parties terminées, solo et multijoueur confondus ;
- les Stones, visuellement prioritaires et accompagnées de leur emblème ;
- la classe B, A ou S dérivée de la valeur courante.

Le Journal de jeu fusionne les deux modes par date décroissante. Chaque duel
privé nomme l’adversaire, affiche la variation nette persistée et permet
d’ouvrir le transcript des manches. Le détail base/récompenses est présenté
immédiatement dans le bilan terminal partagé.

Dans la salle, les Stones et la classe de chaque joueur sont publiques et
attachées à son profil. Après la persistance terminale, les deux clients voient
le même récapitulatif autoritaire : valeur et classe avant, transfert de
résultat, récompenses, variation nette, valeur et classe après. Le taux de
victoire et le compteur de victoires ne font plus partie des statistiques de
profil.
