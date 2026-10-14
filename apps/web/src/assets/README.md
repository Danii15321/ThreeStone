# Assets de marque

## `threestone-logo.jpg`

- Source : `docs/logo.png`, fourni par le propriétaire du projet.
- Transformation : réduction à la taille d’affichage et compression JPEG pour
  respecter le budget individuel de 350 Ko.
- Date : 2026-07-29.
- Usage : identité visuelle de ThreeStone dans le shell public.

Le fichier source reste la référence haute définition. Toute nouvelle variante
doit conserver le nom **ThreeStone**, les trois pierres et la direction fantasy
nordique stylisée.

## `threestone-home-hands.webp`

- Source : `Gemini_Generated_Image_n3ae0n3ae0n3ae0n.png`, visuel généré avec
  Gemini et fourni pour ce projet par son propriétaire.
- Autorisation : intégration demandée explicitement par le propriétaire du
  projet le 2026-07-29.
- Transformation : redimensionnement maximal à `1920×1080` et compression WebP
  sans modification créative du contenu.
- Date : 2026-07-29.
- Usage : arrière-plan de l’accueil, avec les deux mains stylisées de
  ThreeStone.

L’original reste hors du bundle. La variante WebP pèse moins de 60 Ko et
conserve une dégradation correcte grâce au fond brun défini en CSS.

## `game-hands-closed.webp` et `game-hands-open.webp`

- Références fournies :
  `Gemini_Generated_Image_awij27awij27awij.png` et
  `Gemini_Generated_Image_6wi1wl6wi1wl6wi1.png`.
- Création : variantes originales générées pour ThreeStone avec l’outil de
  génération d’images OpenAI, à la demande du propriétaire du projet.
- Direction : mains fantasy nordique stylisées, main gauche en cuir sombre,
  main droite en bandages beiges et fond de pierre brun-charbon neutre commun.
- Transformation : redimensionnement maximal à `1600×900` puis compression
  WebP ; chaque fichier reste très inférieur au budget individuel de 350 Ko.
- Date : 2026-07-29.
- Usage : poses fermée et ouverte du plateau solo animé par Phaser.

Les cailloux, la somme, les profils et les pronostics ne sont pas incrustés dans
les images. Ils restent générés par le moteur de rendu ou par le DOM afin de
refléter l’état réel de chaque manche et de conserver une alternative
accessible.

## `reward-stone-hand.webp`, `reward-stone-eye.webp` et `reward-stone-heart.webp`

- Création : emblèmes originaux générés pour ThreeStone avec l’outil de
  génération d’images OpenAI, à la demande du propriétaire du projet.
- Direction : artefacts de pierre sculptée et bronze patiné, fantasy nordique
  stylisée et peinte à la main, respectivement en forme de main, d’œil et de
  cœur.
- Transformation : suppression du fond chromatique, redimensionnement à
  `256×256`, transparence conservée et compression WebP. Chaque emblème pèse
  moins de 25 Ko.
- Date : 2026-08-02.
- Usage : récompenses « Main de pierre », « Œil en pierre » et « Cœur de
  pierre » dans le bilan multijoueur.

Les libellés et les valeurs de Stones restent du texte DOM : ils ne sont pas
intégrés aux images, afin de rester accessibles et de toujours refléter le
résultat autoritaire du serveur.
