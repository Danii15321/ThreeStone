import { useEffect, useRef } from 'react';
import type PhaserTypes from 'phaser';

import aiVictoryHandsUrl from '../assets/game-hands-ai-victory.jpg';
import closedHandsUrl from '../assets/game-hands-closed.webp';
import humanVictoryHandsUrl from '../assets/game-hands-human-victory.jpg';
import openHandsUrl from '../assets/game-hands-open.webp';
import { createBoardImageMotion } from './board-image-motion.js';
import type { BoardModel } from './board-model.js';
import styles from './PhaserBoard.module.css';

interface PhaserBoardProps {
  readonly highContrast: boolean;
  readonly model: BoardModel;
  readonly reducedMotion: boolean;
}

const BOARD_WIDTH = 960;
const BOARD_HEIGHT = 540;
const CLOSED_HANDS_KEY = 'three-stone-closed-hands';
const OPEN_HANDS_KEY = 'three-stone-open-hands';
const AI_VICTORY_HANDS_KEY = 'three-stone-ai-victory-hands';
const HUMAN_VICTORY_HANDS_KEY = 'three-stone-human-victory-hands';

export function PhaserBoard({ highContrast, model, reducedMotion }: PhaserBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const aiReserve = model.ai.reserve;
  const aiRevealedCount = model.ai.revealedCount;
  const dropStone = model.dropStone;
  const humanReserve = model.human.reserve;
  const humanRevealedCount = model.human.revealedCount;
  const pose = model.pose;

  useEffect(() => {
    let game: PhaserTypes.Game | undefined;
    let cancelled = false;

    void import('phaser').then((module) => {
      if (cancelled || !hostRef.current) {
        return;
      }

      const Phaser = module.default;
      game = new Phaser.Game({
        backgroundColor: '#1c1411',
        height: BOARD_HEIGHT,
        parent: hostRef.current,
        scene: {
          active: true,
          key: 'table',
          preload(this: PhaserTypes.Scene) {
            this.load.image(CLOSED_HANDS_KEY, closedHandsUrl);
            this.load.image(OPEN_HANDS_KEY, openHandsUrl);
            this.load.image(AI_VICTORY_HANDS_KEY, aiVictoryHandsUrl);
            this.load.image(HUMAN_VICTORY_HANDS_KEY, humanVictoryHandsUrl);
          },
          create(this: PhaserTypes.Scene) {
            drawBoard(
              this,
              {
                ai: { reserve: aiReserve, revealedCount: aiRevealedCount },
                dropStone,
                human: { reserve: humanReserve, revealedCount: humanRevealedCount },
                pose,
              },
              reducedMotion,
              highContrast,
            );
          },
        },
        scale: {
          autoCenter: Phaser.Scale.CENTER_BOTH,
          height: BOARD_HEIGHT,
          mode: Phaser.Scale.FIT,
          width: BOARD_WIDTH,
        },
        transparent: true,
        type: Phaser.CANVAS,
        width: BOARD_WIDTH,
      });
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [
    highContrast,
    aiReserve,
    aiRevealedCount,
    dropStone,
    humanReserve,
    humanRevealedCount,
    pose,
    reducedMotion,
  ]);

  const poseDescription = describePose(model);

  return (
    <div
      className={styles.frame}
      role="img"
      aria-label={`Plateau de jeu. ${poseDescription} Vous avez ${model.human.reserve} cailloux, l'ordinateur en a ${model.ai.reserve}.`}
    >
      <div className={styles.canvasHost} ref={hostRef} aria-hidden="true" />
    </div>
  );
}

function drawBoard(
  scene: PhaserTypes.Scene,
  model: BoardModel,
  reducedMotion: boolean,
  highContrast: boolean,
): void {
  const isRevealed = model.pose === 'revealed';
  const victoryKey =
    model.pose === 'ai-victory'
      ? AI_VICTORY_HANDS_KEY
      : model.pose === 'human-victory'
        ? HUMAN_VICTORY_HANDS_KEY
        : null;
  if (victoryKey) {
    drawVictoryPose(scene, victoryKey, reducedMotion, highContrast);
    return;
  }

  const closedHands = scene.add
    .image(BOARD_WIDTH / 2, BOARD_HEIGHT / 2, CLOSED_HANDS_KEY)
    .setOrigin(0.5);
  closedHands.setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT);
  const closedMotion = createBoardImageMotion({
    baseScaleX: closedHands.scaleX,
    baseScaleY: closedHands.scaleY,
    centerX: BOARD_WIDTH / 2,
    centerY: BOARD_HEIGHT / 2,
  });

  if (!isRevealed) {
    if (!reducedMotion) {
      scene.tweens.add({
        duration: 1800,
        ease: 'Sine.InOut',
        repeat: -1,
        scaleX: { from: closedMotion.rest.scaleX, to: closedMotion.breathing.scaleX },
        scaleY: { from: closedMotion.rest.scaleY, to: closedMotion.breathing.scaleY },
        targets: closedHands,
        y: { from: closedMotion.rest.y, to: closedMotion.breathing.y },
        yoyo: true,
      });
    }
    drawVignette(scene, highContrast);
    return;
  }

  const openHands = scene.add
    .image(BOARD_WIDTH / 2, BOARD_HEIGHT / 2, OPEN_HANDS_KEY)
    .setOrigin(0.5);
  openHands.setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT);
  const openMotion = createBoardImageMotion({
    baseScaleX: openHands.scaleX,
    baseScaleY: openHands.scaleY,
    centerX: BOARD_WIDTH / 2,
    centerY: BOARD_HEIGHT / 2,
  });
  if (!reducedMotion && model.dropStone === null) {
    openHands
      .setAlpha(0)
      .setScale(openMotion.revealTransition.scaleX, openMotion.revealTransition.scaleY)
      .setPosition(openMotion.revealTransition.x, openMotion.revealTransition.y);
    scene.tweens.add({
      alpha: 0,
      duration: 430,
      ease: 'Cubic.In',
      scaleX: closedMotion.revealTransition.scaleX,
      scaleY: closedMotion.revealTransition.scaleY,
      targets: closedHands,
      x: closedMotion.revealTransition.x,
      y: closedMotion.revealTransition.y,
    });
    scene.tweens.add({
      alpha: 1,
      delay: 210,
      duration: 590,
      ease: 'Back.Out',
      scaleX: openMotion.rest.scaleX,
      scaleY: openMotion.rest.scaleY,
      targets: openHands,
      x: openMotion.rest.x,
      y: openMotion.rest.y,
    });
  } else {
    closedHands.setVisible(false);
  }

  const stoneObjects = [
    ...drawHandStones(scene, 'ai', model.ai.revealedCount),
    ...drawHandStones(scene, 'human', model.human.revealedCount),
  ];
  if (!reducedMotion && model.dropStone === null) {
    for (const stone of stoneObjects) {
      stone.setAlpha(0).setScale(0.35);
      scene.tweens.add({
        alpha: 1,
        delay: 520,
        duration: 360,
        ease: 'Back.Out',
        scaleX: 1.15,
        scaleY: 1.15,
        targets: stone,
      });
    }
  }

  drawTotalSeal(scene, model.ai.revealedCount + model.human.revealedCount, highContrast);
  drawVignette(scene, highContrast);

  if (model.dropStone) {
    animateDiscard(scene, model.dropStone, reducedMotion, highContrast);
  }
}

function drawVictoryPose(
  scene: PhaserTypes.Scene,
  textureKey: string,
  reducedMotion: boolean,
  highContrast: boolean,
): void {
  const hands = scene.add.image(BOARD_WIDTH / 2, BOARD_HEIGHT / 2, textureKey).setOrigin(0.5);
  hands.setDisplaySize(BOARD_WIDTH, BOARD_HEIGHT);
  const motion = createBoardImageMotion({
    baseScaleX: hands.scaleX,
    baseScaleY: hands.scaleY,
    centerX: BOARD_WIDTH / 2,
    centerY: BOARD_HEIGHT / 2,
  });

  if (!reducedMotion) {
    hands
      .setAlpha(0)
      .setScale(motion.revealTransition.scaleX, motion.revealTransition.scaleY)
      .setPosition(motion.revealTransition.x, motion.revealTransition.y);
    scene.tweens.add({
      alpha: 1,
      duration: 650,
      ease: 'Back.Out',
      onComplete: () => {
        scene.tweens.add({
          duration: 1100,
          ease: 'Sine.InOut',
          repeat: -1,
          scaleX: { from: motion.rest.scaleX, to: motion.breathing.scaleX },
          scaleY: { from: motion.rest.scaleY, to: motion.breathing.scaleY },
          targets: hands,
          y: { from: motion.rest.y, to: motion.breathing.y },
          yoyo: true,
        });
      },
      scaleX: motion.rest.scaleX,
      scaleY: motion.rest.scaleY,
      targets: hands,
      x: motion.rest.x,
      y: motion.rest.y,
    });
  }

  drawVignette(scene, highContrast);
}

function describePose(model: BoardModel): string {
  if (model.pose === 'closed') {
    return 'Les deux mains sont fermées.';
  }
  if (model.pose === 'human-victory') {
    return 'Le joueur célèbre sa victoire avec un pouce levé.';
  }
  if (model.pose === 'ai-victory') {
    return "L'ordinateur célèbre sa victoire avec un pouce levé.";
  }
  return `Les mains sont ouvertes : ${model.ai.revealedCount} caillou${plural(
    model.ai.revealedCount,
  )} pour l'ordinateur et ${model.human.revealedCount} pour vous.`;
}

function drawHandStones(
  scene: PhaserTypes.Scene,
  seat: 'ai' | 'human',
  count: number,
): PhaserTypes.GameObjects.Container[] {
  if (count === 0) {
    return [];
  }

  const center = seat === 'ai' ? { x: 390, y: 375 } : { x: 700, y: 375 };
  const offsets =
    count === 1
      ? [{ x: 0, y: 0 }]
      : count === 2
        ? [
            { x: -22, y: 2 },
            { x: 22, y: -3 },
          ]
        : [
            { x: -28, y: 6 },
            { x: 4, y: -12 },
            { x: 31, y: 10 },
          ];

  return offsets.map((offset, index) =>
    drawStone(scene, center.x + offset.x, center.y + offset.y, index * 0.19 - 0.16).setScale(1.15),
  );
}

function drawStone(
  scene: PhaserTypes.Scene,
  x: number,
  y: number,
  rotation: number,
): PhaserTypes.GameObjects.Container {
  const points = [0, 9, 8, 0, 25, 2, 35, 12, 29, 27, 12, 31, 1, 22];
  const shadow = scene.add.polygon(4, 7, points, 0x090605, 0.46).setOrigin(0.5);
  const stone = scene.add
    .polygon(0, 0, points, 0x8d8579, 1)
    .setOrigin(0.5)
    .setStrokeStyle(2, 0xe7d7bd, 0.32);
  const highlight = scene.add
    .polygon(-5, -6, [0, 5, 7, 0, 15, 2, 10, 8], 0xe9dbc4, 0.27)
    .setOrigin(0.5);
  return scene.add.container(x, y, [shadow, stone, highlight]).setRotation(rotation);
}

function drawTotalSeal(scene: PhaserTypes.Scene, total: number, highContrast: boolean): void {
  const seal = scene.add.graphics();
  seal.fillStyle(highContrast ? 0x130d0a : 0x291b16, 0.94);
  seal.fillCircle(BOARD_WIDTH / 2, 118, 42);
  seal.lineStyle(3, highContrast ? 0xffe084 : 0xd8a85f, 0.95);
  seal.strokeCircle(BOARD_WIDTH / 2, 118, 42);
  scene.add
    .text(BOARD_WIDTH / 2, 105, String(total), textStyle(0xffedc5, 34, 'bold'))
    .setOrigin(0.5);
  scene.add
    .text(BOARD_WIDTH / 2, 139, 'SOMME', textStyle(0xd9b87e, 10, 'bold'))
    .setLetterSpacing(2)
    .setOrigin(0.5);
}

function animateDiscard(
  scene: PhaserTypes.Scene,
  seat: 'ai' | 'human',
  reducedMotion: boolean,
  highContrast: boolean,
): void {
  const start = seat === 'ai' ? { x: 90, y: 130 } : { x: 870, y: 130 };
  const target = { x: BOARD_WIDTH / 2, y: 464 };
  const discarded = drawStone(scene, start.x, start.y, 0);
  discarded.setScale(1.12).setDepth(20);

  if (reducedMotion) {
    discarded.setPosition(target.x, target.y);
    return;
  }

  const progress = { value: 0 };
  scene.tweens.add({
    duration: 860,
    ease: 'Cubic.InOut',
    onComplete: () => {
      const impact = scene.add.circle(
        target.x,
        target.y + 6,
        18,
        highContrast ? 0xffdf71 : 0xd7a45a,
        0.28,
      );
      scene.tweens.add({
        alpha: 0,
        duration: 380,
        scaleX: 2.4,
        scaleY: 1.1,
        targets: impact,
      });
    },
    onUpdate: () => {
      const value = progress.value;
      discarded.setPosition(
        start.x + (target.x - start.x) * value,
        start.y + (target.y - start.y) * value - Math.sin(Math.PI * value) * 135,
      );
      discarded.setRotation(value * Math.PI * 2.4);
    },
    targets: progress,
    value: 1,
  });
}

function drawVignette(scene: PhaserTypes.Scene, highContrast: boolean): void {
  const border = scene.add.graphics().setDepth(30);
  border.lineStyle(
    highContrast ? 5 : 3,
    highContrast ? 0xffe084 : 0xa86d3d,
    highContrast ? 1 : 0.52,
  );
  border.strokeRoundedRect(3, 3, BOARD_WIDTH - 6, BOARD_HEIGHT - 6, 22);
  border.fillStyle(0x120c09, 0.25);
  border.fillRect(0, 0, BOARD_WIDTH, 45);
  border.fillRect(0, BOARD_HEIGHT - 45, BOARD_WIDTH, 45);
}

function textStyle(
  color: number,
  fontSize: number,
  fontStyle = 'normal',
): PhaserTypes.Types.GameObjects.Text.TextStyle {
  return {
    color: `#${color.toString(16).padStart(6, '0')}`,
    fontFamily: 'Georgia, Palatino Linotype, serif',
    fontSize: `${fontSize}px`,
    fontStyle,
  };
}

function plural(count: number): string {
  return count > 1 ? 'x' : '';
}
