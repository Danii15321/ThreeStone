export type ButtonFeedbackAction = 'choice-confirmed' | 'prediction-confirmed' | 'stone-toggle';

export type FeedbackCue = 'choice' | 'prediction' | 'stone';

let sharedContext: AudioContext | null = null;

interface CueNote {
  readonly duration: number;
  readonly endFrequency?: number;
  readonly frequency: number;
  readonly gain: number;
  readonly startsAt: number;
  readonly waveform: OscillatorType;
}

export function selectButtonFeedbackCue(action: ButtonFeedbackAction): FeedbackCue {
  const cues: Record<ButtonFeedbackAction, FeedbackCue> = {
    'choice-confirmed': 'choice',
    'prediction-confirmed': 'prediction',
    'stone-toggle': 'stone',
  };
  return cues[action];
}

export function playFeedbackCue(cue: FeedbackCue, volume: number): void {
  const context = getAudioContext();
  const normalizedVolume = normalizeVolume(volume);
  if (!context || normalizedVolume === 0) {
    return;
  }

  resumeGameAudio();
  const now = context.currentTime;

  for (const note of cueNotes(cue)) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startsAt = now + note.startsAt;
    const peak = Math.max(0.0001, normalizedVolume * note.gain);
    oscillator.frequency.setValueAtTime(note.frequency, startsAt);
    if (note.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        note.endFrequency,
        startsAt + note.duration,
      );
    }
    oscillator.type = note.waveform;
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(peak, startsAt + Math.min(0.025, note.duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + note.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + note.duration + 0.02);
  }
}

export function resumeGameAudio(): void {
  if (sharedContext?.state === 'suspended') {
    void sharedContext.resume().catch(() => undefined);
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  sharedContext ??= new AudioContext();
  return sharedContext;
}

function normalizeVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(volume, 1)) : 0;
}

function cueNotes(cue: FeedbackCue): readonly CueNote[] {
  const notes: Record<FeedbackCue, readonly CueNote[]> = {
    choice: [
      cueNote(0, 0.16, 174.61, 0.1, 'triangle', 146.83),
      cueNote(0.07, 0.19, 220, 0.085, 'sine'),
    ],
    prediction: [
      cueNote(0, 0.18, 293.66, 0.09, 'triangle'),
      cueNote(0.09, 0.24, 440, 0.08, 'sine'),
    ],
    stone: [
      cueNote(0, 0.11, 155.56, 0.09, 'triangle', 98),
      cueNote(0.025, 0.08, 311.13, 0.035, 'square', 220),
    ],
  };
  return notes[cue];
}

function cueNote(
  startsAt: number,
  duration: number,
  frequency: number,
  gain: number,
  waveform: OscillatorType,
  endFrequency?: number,
): CueNote {
  return endFrequency === undefined
    ? { duration, frequency, gain, startsAt, waveform }
    : { duration, endFrequency, frequency, gain, startsAt, waveform };
}
