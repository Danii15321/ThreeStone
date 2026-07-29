# Calibration de l'IA v1

## Protocole

- Graine : `20260729`.
- Échantillon : `1 000` parties par difficulté.
- Siège évalué : `player-one`.
- Politique de référence : choix uniforme parmi les actions légales.
- Initiative alternée par le numéro de partie.
- Moteur réel utilisé pour toutes les transitions.
- Plafond de sécurité : `2 000` actions par partie.

La simulation est reproductible avec `runDifficultySimulation`. Le contrôle
complémentaire `measurePredictionQuality` mesure la qualité d'estimation sur un
historique public connu, sans donner accès au choix courant de l'adversaire.

## Résultats

| Difficulté | Parties terminées | Victoires | Taux de victoire | Manches moyennes | Maximum | Choix distincts | Pronostics distincts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Easy | 1 000 | 630 | 63,0 % | 13,302 | 41 | 4 | 7 |
| Normal | 1 000 | 799 | 79,9 % | 11,198 | 31 | 4 | 7 |
| Hard | 1 000 | 863 | 86,3 % | 9,675 | 25 | 4 | 7 |

- Actions illégales : `0`.
- Parties incomplètes : `0`.
- Sur `10 000` décisions par niveau, taux de pronostic optimal : `16,57 %`
  (easy), `61,52 %` (normal), `87,76 %` (hard).

## Interprétation

Les trois profils sont distincts et progressifs face à la politique de
référence. La difficulté agit sur la qualité d'estimation, la mémoire publique,
le bluff et le bruit contrôlé. Elle ne modifie jamais les actions légales et ne
donne aucun accès à un choix adverse non révélé.

Ces chiffres sont une référence technique reproductible, pas une preuve
d'équilibrage produit définitive. Une calibration contre des joueurs réels
relève de la v1.x et devra conserver les mêmes contraintes de confidentialité.
