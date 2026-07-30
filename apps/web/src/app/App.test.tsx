import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFERENCES } from '../features/settings/preferences.js';
import { App } from './App';
import { GameSettingsPanel } from './GameSettingsPanel.js';

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

  it('does not expose audio controls because the game is fully silent', () => {
    const html = renderToStaticMarkup(
      <GameSettingsPanel
        onClose={() => undefined}
        onPreferences={() => undefined}
        preferences={DEFAULT_PREFERENCES}
      />,
    );

    expect(html).not.toContain('Mode muet');
    expect(html).not.toContain('Volume des effets');
    expect(html).not.toContain('sons des boutons');
  });
});
