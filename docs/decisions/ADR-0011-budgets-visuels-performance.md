# ADR-0011 — Budgets visuels, accessibilité et performance

- Statut : accepté
- Date : 2026-07-29
- Version cible : v1

## Contexte

La direction 2.5D de fantasy nordique stylisée ne doit pas compromettre la jouabilité mobile,
l'accessibilité ni le temps d'accès aux contrôles. Des objectifs sans protocole
de mesure ne constituent pas des budgets.

## Cibles de validation

La v1 valide au minimum :

- largeurs/hauteurs `360×640`, `390×844`, `844×390` et `1366×768` ;
- Chrome/Edge et Firefox dans leur version courante et précédente ;
- Safari courant et précédent sur macOS/iOS ;
- Chrome Android sur un appareil intermédiaire avec 4 Go de mémoire ;
- souris, tactile, clavier seul, lecteur d'écran de référence et
  `prefers-reduced-motion`.

La CI couvre Chromium, Firefox et WebKit avec Playwright. Une vraie validation
Safari/iOS et Android est réalisée avant la candidate.

## Décision

### Poids transféré, compressé

| Étape                                           | Budget maximal |
| ----------------------------------------------- | -------------: |
| Shell public : HTML + CSS + JS initial          |         250 Ko |
| Route de jeu jusqu'aux contrôles interactifs    | 850 Ko cumulés |
| Assets visuels nécessaires à la première manche | 1,5 Mo cumulés |
| Audio nécessaire à la première manche           | 800 Ko cumulés |
| Première manche jouable, code et assets compris | 2,5 Mo cumulés |
| Contenu optionnel différé de toute la v1        |           6 Mo |

Phaser, les textures haute qualité et l'audio sont chargés à la demande. Une
image individuelle ne dépasse pas 350 Ko, un atlas 1 Mo et un fichier audio
800 Ko sans justification mesurée. WOFF2 est le seul format de police externe
accepté ; au plus deux familles et quatre fichiers sont chargés.

### Temps et fluidité

Mesure de laboratoire sur profil mobile intermédiaire, réseau « Fast 4G »,
cache froid :

- LCP au plus 2,5 s ;
- CLS au plus 0,1 ;
- interaction réactive en moins de 200 ms ;
- contrôles de jeu disponibles en moins de 4 s ;
- aucune tâche principale supérieure à 200 ms pendant une action ;
- au moins 30 images/s soutenues sur mobile cible et 60 images/s visées sur
  desktop, avec un 95e percentile de frame inférieur à 33 ms sur mobile ;
- une transition pure du moteur sous 1 ms au 95e percentile et sous 5 ms au
  maximum sur le scénario de référence ;
- après dix montages/destructions du plateau, la mémoire stabilisée ne croît pas
  de plus de 10 Mo et aucun listener ou contexte audio orphelin ne subsiste.

Une animation ordinaire dure au plus 700 ms et la révélation complète au plus
1 200 ms. Toute séquence est passable. En réduction de mouvement, l'information
finale est disponible en moins de 100 ms, sans mouvement non essentiel.

### Accessibilité et dégradation

- WCAG 2.2 niveau AA est la cible.
- Contraste texte normal `4.5:1`, grand texte et composants graphiques `3:1`.
- Cible tactile minimale `44×44` pixels CSS.
- Zoom texte à 200 % sans perte d'action.
- Aucun contenu essentiel uniquement par couleur, son, animation ou canvas.
- Le refus de WebGL ou d'autoplay audio ne bloque pas la partie.

### Qualité des assets

Chaque asset possède source, auteur, licence, attribution éventuelle, date et
format source. Les assets générés indiquent l'outil et la consigne de
provenance. Un asset sans droit clair n'entre pas dans le build.

L'identité visuelle repose sur une palette chaude de cuir, bois, parchemin,
pierre grise, bronze et brun anthracite. Les silhouettes sont massives ou
facettées, avec un rendu peint à la main plutôt que photoréaliste. Le cyan
néon et les codes visuels futuristes sont exclus de l'interface principale.

## Méthode de contrôle

- Le build publie le poids compressé par chunk et échoue au dépassement d'un
  budget dur.
- Playwright contrôle les viewports, le clavier, le mode réduit et l'absence de
  débordement.
- Une mesure Lighthouse ou WebPageTest reproductible est archivée pour chaque
  candidate.
- Les FPS et la mémoire sont mesurés sur les appareils cibles, pas inférés du
  desktop.
- Une exception exige une mesure avant/après, un propriétaire et une échéance ;
  elle ne devient pas silencieusement le nouveau budget.

## Conséquences

- La finition artistique se fait dans les budgets, avec niveaux de qualité ou
  chargement différé si nécessaire.
- Un effet qui dépasse un budget sans bénéfice utilisateur démontré est retiré.
- Les seuils pourront être resserrés en v1.x à partir de mesures réelles, jamais
  relâchés sans ADR.
