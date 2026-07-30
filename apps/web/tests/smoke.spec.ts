import { expect, test } from '@playwright/test';

test('creates a username account, finishes a solo game and persists its result', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name.replaceAll(/[^a-z0-9]/gi, '').slice(0, 8);
  const username = `e2e_${project}_${Date.now().toString(36)}`.slice(0, 24);
  const renamedUsername = `${username.slice(0, 20)}_v2`;
  const password = 'E2E-Password-2026!';
  const changedPassword = 'E2E-Changed-2026!';

  await page.addInitScript(() => {
    // Keep the complete game journey reproducible without changing production randomness.
    const nativeGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value: (array: ArrayBufferView): ArrayBufferView => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = 0x5eed;
          return array;
        }
        return nativeGetRandomValues(array);
      },
    });
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ThreeStone' })).toBeVisible();
  await expect(page.getByText('Art du bluff ou science de la déduction')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commencez une partie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment jouer' })).toBeVisible();
  await expect(page.getByText('Trois cailloux.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Comment jouer' }).click();
  await expect(page.getByRole('heading', { name: 'Règles du jeu' })).toBeVisible();
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();

  await page.getByRole('button', { name: 'Mon compte' }).click();
  await page.getByRole('tab', { name: 'Inscription' }).click();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  const signUpResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/auth/sign-up/username'),
  );
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  const signUpResponse = await signUpResponsePromise;
  expect(
    signUpResponse.status(),
    `L'inscription a échoué (${signUpResponse.status()}): ${await signUpResponse.text()}`,
  ).toBe(200);
  await expect(page.getByRole('heading', { name: username })).toBeVisible();
  await expect(page.getByText(`@${username.toLowerCase()}`)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Profil' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Confidentialité' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exporter mes données' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Confidentialité' }).click();
  await page.getByText('Profil joueur').click();
  await page.locator('textarea[name="bio"]').fill('Stratège patient, toujours prêt à bluffer.');
  await page.getByRole('button', { name: 'Enregistrer la bio' }).click();
  await expect(page.getByRole('status')).toContainText('Bio enregistrée');
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

  await page.getByText('Identité de connexion').click();
  await page.locator('input[name="username"]').fill(renamedUsername);
  await page.getByRole('button', { name: 'Modifier le pseudonyme' }).click();
  await expect(page.getByRole('status')).toContainText('Pseudonyme de connexion modifié');

  await page.getByText('Mot de passe et sécurité').click();
  await page.locator('input[name="currentPassword"]').fill(password);
  await page.locator('input[name="newPassword"]').fill(changedPassword);
  await page.getByRole('button', { name: 'Modifier le mot de passe' }).click();
  await expect(page.getByRole('status')).toContainText('Mot de passe modifié');

  await page.getByRole('tab', { name: 'Profil' }).click();
  await expect(page.getByRole('heading', { name: renamedUsername })).toBeVisible();
  await expect(page.getByText('Stratège patient, toujours prêt à bluffer.')).toBeVisible();
  await expect(page.getByRole('img', { name: `Avatar de ${renamedUsername}` })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.locator('input[name="username"]').fill(renamedUsername.toUpperCase());
  await page.locator('input[name="password"]').fill(changedPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: renamedUsername })).toBeVisible();
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();

  await page.getByRole('button', { name: 'Paramètres du jeu' }).click();
  await page.getByRole('combobox', { name: 'Mouvements' }).selectOption('reduced');
  await page.getByRole('checkbox', { name: 'Contraste renforcé' }).check();
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();

  await page.getByRole('button', { name: 'Commencez une partie' }).click();
  await expect(page.getByRole('dialog', { name: 'Choisissez votre mode' })).toBeVisible();
  await page.getByRole('button', { name: /Multijoueur/ }).click();
  await expect(page.getByRole('heading', { name: 'Multijoueur en préparation' })).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux modes' }).click();
  await page.getByRole('button', { name: 'Mode solo' }).click();
  await expect(page.getByRole('heading', { name: 'Choisissez la difficulté' })).toBeVisible();
  await page.getByRole('button', { name: 'Moyen' }).click();
  await expect(page.getByRole('status')).toContainText('Préparation de la table');
  await expect(page.getByRole('region', { name: 'Ordinateur' })).toBeVisible();
  await expect(page.getByRole('region', { name: renamedUsername })).toBeVisible();
  await expect(page.getByRole('img', { name: `Avatar de ${renamedUsername}` })).toBeVisible();
  await expect(page.getByText(/annonce en premier/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Valider mon choix' })).toBeVisible();

  for (let step = 0; step < 120; step += 1) {
    if (await page.getByRole('button', { name: 'Rejouer' }).isVisible()) {
      break;
    }
    const confirmStones = page.getByRole('button', { name: 'Valider mon choix' });
    if (await confirmStones.isVisible()) {
      await confirmStones.click();
      continue;
    }

    const prediction = page.getByRole('slider', { name: 'Votre pronostic' });
    if (await prediction.isVisible()) {
      await expect(prediction).toHaveAttribute('min', '0');
      await expect(prediction).toHaveAttribute('max', '6');
      await page.getByRole('button', { name: /^Annoncer \d$/ }).click();
      continue;
    }

    await page.waitForTimeout(100);
  }

  await expect(page.getByRole('button', { name: 'Rejouer' })).toBeVisible();
  const humanWon = await page.getByRole('heading', { name: 'Victoire !' }).isVisible();
  const winnerName = humanWon ? renamedUsername : 'Ordinateur';
  await expect(
    page.getByRole('img', { name: `Couronne de victoire de ${winnerName}` }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /^Plateau de jeu\./ })).toHaveAttribute(
    'aria-label',
    /pouce levé/,
  );
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  await expect(page.getByRole('button', { name: 'Commencez une partie' })).toBeVisible();

  await page.getByRole('button', { name: 'Mon compte' }).click();
  await expect(page.getByRole('definition').first()).toHaveText('1');
  await expect(page.getByRole('region', { name: 'Dernières parties' })).toContainText('manches');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Retour à l’accueil' })).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Profil' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('tab', { name: 'Confidentialité' }).click();
  await expect(page.getByText('Profil joueur')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByText('Zone sensible').click();
  await page.locator('input[name="confirmation"]').fill('SUPPRIMER');
  await page.locator('input[name="password"]').fill(changedPassword);
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  await expect(page.getByRole('button', { name: 'Commencez une partie' })).toBeVisible();
});

test('remains usable at the narrow mobile viewport with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Commencez une partie' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Comment jouer' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Paramètres du jeu' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
