import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const password = 'E2E-Multiplayer-2026!';

async function createPlayer(context: BrowserContext, username: string, withAvatar = false) {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Mon compte' }).click();
  await page.getByRole('tab', { name: 'Inscription' }).click();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByRole('heading', { name: username })).toBeVisible();

  if (withAvatar) {
    await page.getByRole('tab', { name: 'Confidentialité' }).click();
    await page.getByText('Profil joueur').click();
    await page.locator('input[name="avatar"]').setInputFiles({
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      mimeType: 'image/png',
      name: 'avatar.png',
    });
    await page.getByRole('button', { name: 'Envoyer la photo' }).click();
    await expect(page.getByRole('status')).toContainText('Photo de profil mise à jour');
  }

  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  return page;
}

async function openMultiplayer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Commencez une partie' }).click();
  await page.getByRole('button', { name: /Multijoueur/ }).click();
  await expect(page.getByRole('heading', { name: 'Choisissez votre table' })).toBeVisible();
}

test('two isolated browser contexts finish the same authoritative match', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'The cross-browser smoke remains in smoke.spec.ts.',
  );

  const suffix = Date.now().toString(36);
  const creatorName = `host_${suffix}`.slice(0, 24);
  const guestName = `guest_${suffix}`.slice(0, 24);
  const creatorContext = await browser.newContext();
  const guestContext = await browser.newContext();

  try {
    const creator = await createPlayer(creatorContext, creatorName, true);
    const guest = await createPlayer(guestContext, guestName);

    await openMultiplayer(creator);
    await creator.getByRole('button', { name: 'Créer un salon' }).click();
    const inviteCode = await creator
      .locator('strong')
      .filter({ hasText: /^[23456789A-HJ-NP-Z]{6}$/ })
      .textContent();
    expect(inviteCode).toMatch(/^[23456789A-HJ-NP-Z]{6}$/);

    await openMultiplayer(guest);
    await guest.getByRole('button', { name: 'Rejoindre' }).click();
    await guest.getByRole('textbox', { name: 'Code d’invitation' }).fill(inviteCode!);
    await guest.getByRole('button', { name: 'Prendre place' }).click();

    await expect(creator.getByRole('group', { name: 'Choisissez vos cailloux' })).toBeVisible();
    await expect(guest.getByRole('group', { name: 'Choisissez vos cailloux' })).toBeVisible();
    await expect(creator.getByRole('region', { name: `${creatorName}, connecté` })).toHaveAttribute(
      'data-side',
      'right',
    );
    await expect(guest.getByRole('region', { name: `${guestName}, connecté` })).toHaveAttribute(
      'data-side',
      'right',
    );
    await expect(creator.getByRole('img', { name: `Avatar de ${creatorName}` })).toBeVisible();
    await expect(guest.getByRole('img', { name: `Avatar de ${creatorName}` })).toBeVisible();

    for (let round = 1; round <= 3; round += 1) {
      await creator.getByRole('button', { name: 'Caillou 1' }).click();
      await guest.getByRole('button', { name: 'Caillou 1' }).click();
      await creator.getByRole('button', { name: 'Valider mon choix · 1' }).click();
      await expect(creator.locator('body')).not.toContainText('choix adverse');
      await guest.getByRole('button', { name: 'Valider mon choix · 1' }).click();

      const creatorPredictsFirst = await creator
        .getByRole('slider', { name: 'Votre pronostic' })
        .isVisible();
      const first = creatorPredictsFirst ? creator : guest;
      const second = creatorPredictsFirst ? guest : creator;
      const firstPrediction = creatorPredictsFirst ? 2 : 0;
      const secondPrediction = creatorPredictsFirst ? 0 : 2;

      await first.getByRole('slider', { name: 'Votre pronostic' }).fill(String(firstPrediction));
      await first.getByRole('button', { name: `Annoncer ${firstPrediction}` }).click();
      await expect(second.getByRole('slider', { name: 'Votre pronostic' })).toBeVisible();
      await second.getByRole('slider', { name: 'Votre pronostic' }).fill(String(secondPrediction));
      await second.getByRole('button', { name: `Annoncer ${secondPrediction}` }).click();

      const expectedCreatorReserve = 3 - round;
      await expect(creator.getByRole('region', { name: `${creatorName}, connecté` })).toContainText(
        `${expectedCreatorReserve} caillou`,
      );
      await expect(guest.getByRole('region', { name: `${creatorName}, connecté` })).toContainText(
        `${expectedCreatorReserve} caillou`,
      );
    }

    await expect(creator.getByRole('heading', { name: 'Victoire !' })).toBeVisible();
    await expect(
      guest.getByRole('heading', { name: `${creatorName} remporte la partie` }),
    ).toBeVisible();
    await expect(
      creator.getByRole('img', { name: `Couronne de victoire de ${creatorName}` }),
    ).toBeVisible();
    await expect(
      guest.getByRole('img', { name: `Couronne de victoire de ${creatorName}` }),
    ).toBeVisible();
    await expect(creator.getByRole('img', { name: /^Plateau de jeu\./ })).toHaveAttribute(
      'aria-label',
      new RegExp(`${creatorName} célèbre sa victoire avec un pouce levé`),
    );
    await expect(guest.getByRole('img', { name: /^Plateau de jeu\./ })).toHaveAttribute(
      'aria-label',
      new RegExp(`${creatorName} célèbre sa victoire avec un pouce levé`),
    );
  } finally {
    await creatorContext.close();
    await guestContext.close();
  }
});
