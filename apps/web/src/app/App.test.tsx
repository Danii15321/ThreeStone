import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('ThreeStone application shell', () => {
  it('presents the focused home and keeps secondary settings in navigation', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('ThreeStone');
    expect(html).toContain('>ThreeStone</h1>');
    expect(html).toContain('Art du bluff ou science de la déduction');
    expect(html).toContain('Commencez une partie');
    expect(html).toContain('Comment jouer');
    expect(html).toContain('Paramètres du jeu');
    expect(html).toContain('Mon compte');
    expect(html).not.toContain('Stratégie · déduction · bluff');
    expect(html).not.toContain('Trois cailloux.');
    expect(html).not.toContain('Première partie');
    expect(html).not.toContain('Réglez votre partie');
  });
});
