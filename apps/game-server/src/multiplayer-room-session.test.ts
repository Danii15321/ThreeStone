import { abandonGame, createGame } from '@three-stone/game-core';
import { describe, expect, it } from 'vitest';

import { MultiplayerRoomSession } from './multiplayer-room-session.js';

describe('MultiplayerRoomSession', () => {
  it('erases score, rematch agreement and reaction rate state when the room closes', () => {
    const session = new MultiplayerRoomSession('room-session', 60_000);
    const terminal = abandonGame(
      createGame({ gameId: 'game-one', seed: 1, sequenceNumber: 1 }).state,
      'player-two',
    );
    if (!terminal.ok) {
      throw new Error(terminal.error.code);
    }
    session.recordTerminalGame(terminal.state, 1_000);
    session.decideRematch('player-one', true, 2_000);
    expect(session.acceptReaction('player-one', 2_000)).toBe(true);

    session.close();

    expect(session.score).toEqual({ 'player-one': 0, 'player-two': 0 });
    expect(session.rematch).toEqual({
      accepted: { 'player-one': false, 'player-two': false },
      deadline: null,
    });
    expect(session.acceptReaction('player-one', 2_001)).toBe(true);
  });
});
