import { describe, expect, it } from 'vitest';

import { selectButtonFeedbackCue } from './audio-feedback.js';

describe('solo button audio feedback', () => {
  it('keeps a short cue for each audible game button', () => {
    expect(selectButtonFeedbackCue('stone-toggle')).toBe('stone');
    expect(selectButtonFeedbackCue('choice-confirmed')).toBe('choice');
    expect(selectButtonFeedbackCue('prediction-confirmed')).toBe('prediction');
  });
});
