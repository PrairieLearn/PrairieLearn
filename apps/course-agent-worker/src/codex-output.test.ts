import { describe, expect, it } from 'vitest';

import { codexFailureMessage } from './codex-output.js';

describe('codexFailureMessage', () => {
  it('returns the structured turn failure instead of incidental stderr', () => {
    const stdout = [
      JSON.stringify({ type: 'error', message: 'Reconnecting' }),
      JSON.stringify({ type: 'turn.failed', error: { message: 'Provider rejected the request' } }),
    ].join('\n');
    expect(codexFailureMessage(stdout, 'Reading additional input from stdin...')).toBe(
      'Provider rejected the request',
    );
  });

  it('falls back to stderr when no structured failure exists', () => {
    expect(codexFailureMessage('', 'Agent failed')).toBe('Agent failed');
  });
});
