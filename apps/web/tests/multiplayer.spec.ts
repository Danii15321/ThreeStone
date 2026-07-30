import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

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

async function setSliderWithKeyboard(slider: Locator, target: number): Promise<void> {
  await slider.focus();
  await slider.press('Home');
  for (let step = 0; step < 7; step += 1) {
    const current = Number(await slider.inputValue());
    if (current === target) {
      return;
    }
    await slider.press(current < target ? 'ArrowRight' : 'ArrowLeft');
  }
  await expect(slider).toHaveValue(String(target));
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          className: element.className,
          clientWidth: element.clientWidth,
          left: Math.round(bounds.left),
          overflowX: getComputedStyle(element).overflowX,
          right: Math.round(bounds.right),
          scrollWidth: element.scrollWidth,
          tagName: element.tagName,
          width: Math.round(bounds.width),
        };
      })
      .filter(
        ({ clientWidth, left, overflowX, right, scrollWidth, width }) =>
          left < -1 ||
          right > document.documentElement.clientWidth + 1 ||
          width > document.documentElement.clientWidth + 1 ||
          (overflowX === 'visible' &&
            scrollWidth > clientWidth + 1 &&
            (left + scrollWidth > document.documentElement.clientWidth + 1 ||
              left + clientWidth - scrollWidth < -1)),
      )
      .slice(0, 10),
  );
  expect(offenders).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
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
    await creator.emulateMedia({ reducedMotion: 'reduce' });
    await guest.emulateMedia({ reducedMotion: 'reduce' });

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
      const creatorStone = creator.getByRole('button', { name: 'Caillou 1' });
      await creatorStone.focus();
      await creatorStone.press('Space');
      await guest.getByRole('button', { name: 'Caillou 1' }).click();
      const creatorChoice = creator.getByRole('button', { name: 'Valider mon choix · 1' });
      await creatorChoice.focus();
      await creatorChoice.press('Enter');
      await expect(creator.locator('body')).not.toContainText('choix adverse');
      await guest.getByRole('button', { name: 'Valider mon choix · 1' }).click();

      const creatorPredictsFirst = await creator
        .getByRole('slider', { name: 'Votre pronostic' })
        .isVisible();
      const first = creatorPredictsFirst ? creator : guest;
      const second = creatorPredictsFirst ? guest : creator;
      const firstPrediction = creatorPredictsFirst ? 2 : 0;
      const secondPrediction = creatorPredictsFirst ? 0 : 2;

      const firstSlider = first.getByRole('slider', { name: 'Votre pronostic' });
      await setSliderWithKeyboard(firstSlider, firstPrediction);
      const firstAnnouncement = first.getByRole('button', {
        name: `Annoncer ${firstPrediction}`,
      });
      await firstAnnouncement.focus();
      await firstAnnouncement.press('Enter');
      await expect(second.getByRole('slider', { name: 'Votre pronostic' })).toBeVisible();
      const secondSlider = second.getByRole('slider', { name: 'Votre pronostic' });
      await setSliderWithKeyboard(secondSlider, secondPrediction);
      const secondAnnouncement = second.getByRole('button', {
        name: `Annoncer ${secondPrediction}`,
      });
      await secondAnnouncement.focus();
      await secondAnnouncement.press('Enter');

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

    await expect(creator.getByLabel('Score de la série')).toContainText('0 – 1');
    await expect(guest.getByLabel('Score de la série')).toContainText('1 – 0');

    await guest.getByRole('button', { name: 'Bien joué !' }).click();
    await expect(creator.getByRole('status').filter({ hasText: 'Bien joué !' })).toBeVisible();

    await creator.getByRole('button', { name: 'Demander une revanche' }).click();
    await expect(creator.getByRole('button', { name: 'Revanche demandée' })).toBeDisabled();
    await guest.getByRole('button', { name: 'Demander une revanche' }).click();

    await expect(creator.getByRole('group', { name: 'Choisissez vos cailloux' })).toBeVisible();
    await expect(guest.getByRole('group', { name: 'Choisissez vos cailloux' })).toBeVisible();
    await expect(creator.getByLabel('Score de la série')).toContainText('0 – 1');

    for (const page of [creator, guest]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expect(page.getByRole('group', { name: 'Choisissez vos cailloux' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Valider mon choix/ })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  } finally {
    await creatorContext.close();
    await guestContext.close();
  }
});
