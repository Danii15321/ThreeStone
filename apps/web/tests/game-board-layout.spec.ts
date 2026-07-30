import { expect, test, type Locator, type Page } from '@playwright/test';

interface BoardGeometry {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

async function readGeometry(locator: Locator): Promise<BoardGeometry> {
  let box: BoardGeometry | null = null;
  await expect
    .poll(
      async () => {
        box = await locator.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          };
        });
        return box.width > 0 && box.height > 0;
      },
      { message: 'Le plateau doit rester mesurable pendant les animations' },
    )
    .toBe(true);

  return box!;
}

function expectStableGeometry(actual: BoardGeometry, expected: BoardGeometry): void {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.left - expected.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.top - expected.top)).toBeLessThanOrEqual(2);
}

function expectCanvasFillsBoard(canvas: BoardGeometry, board: BoardGeometry): void {
  expect(Math.abs(canvas.width - board.width)).toBeLessThanOrEqual(3);
  expect(Math.abs(canvas.height - board.height)).toBeLessThanOrEqual(3);
  expect(Math.abs(canvas.left - board.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(canvas.top - board.top)).toBeLessThanOrEqual(2);
}

async function startSoloGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencez une partie' }).click();
  await page.getByRole('button', { name: 'Mode solo' }).click();
  await page.getByRole('button', { name: 'Facile' }).click();
  await expect(page.getByRole('button', { name: 'Valider mon choix' })).toBeVisible();
}

const viewports = [
  { height: 1600, label: 'computer portrait capture', width: 1158 },
  { height: 844, label: 'narrow mobile', width: 390 },
] as const;

for (const viewport of viewports) {
  test(`keeps the hands frame attached throughout the reveal animation on ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startSoloGame(page);

    const board = page.getByRole('img', { name: /^Plateau de jeu\./ });
    const canvas = board.locator('canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(750);

    const initialBoard = await readGeometry(board);
    const initialCanvas = await readGeometry(canvas);
    expect(Math.abs(initialBoard.width / initialBoard.height - 16 / 9)).toBeLessThan(0.015);
    expectCanvasFillsBoard(initialCanvas, initialBoard);

    await page.getByRole('button', { name: 'Valider mon choix' }).click();
    const prediction = page.getByRole('slider', { name: 'Votre pronostic' });
    await expect(prediction).toBeVisible();
    await page.getByRole('button', { name: /^Annoncer \d$/ }).click();

    for (let sample = 0; sample < 24; sample += 1) {
      const currentBoard = await readGeometry(board);
      const currentCanvas = await readGeometry(canvas);
      expectStableGeometry(currentBoard, initialBoard);
      expectStableGeometry(currentCanvas, initialCanvas);
      expectCanvasFillsBoard(currentCanvas, currentBoard);
      await page.waitForTimeout(150);
    }

    await expect(board).toHaveAttribute('aria-label', /Les mains sont ouvertes/, {
      timeout: 5_000,
    });
  });
}
