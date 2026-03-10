import { assert, describe, it } from 'vitest';

import { extractDefaultPreferences } from './question-preferences.js';

describe('extractDefaultPreferences', () => {
  it('returns empty object for null schema', () => {
    assert.deepEqual(extractDefaultPreferences(null), {});
  });

  it('returns empty object for undefined schema', () => {
    assert.deepEqual(extractDefaultPreferences(undefined), {});
  });

  it('returns empty object for empty schema', () => {
    assert.deepEqual(extractDefaultPreferences({}), {});
  });

  it('extracts a string default', () => {
    assert.deepEqual(extractDefaultPreferences({ theme: { default: 'light' } }), {
      theme: 'light',
    });
  });

  it('extracts a number default', () => {
    assert.deepEqual(extractDefaultPreferences({ gravitational_constant: { default: 9.8 } }), {
      gravitational_constant: 9.8,
    });
  });

  it('extracts a boolean default', () => {
    assert.deepEqual(extractDefaultPreferences({ show_hints: { default: false } }), {
      show_hints: false,
    });
  });

  it('extracts defaults for multiple fields', () => {
    assert.deepEqual(
      extractDefaultPreferences({
        theme: { default: 'dark' },
        font_size: { default: 14 },
        show_hints: { default: true },
      }),
      { theme: 'dark', font_size: 14, show_hints: true },
    );
  });

  it('extracts default from an enum-like field (only default matters)', () => {
    assert.deepEqual(extractDefaultPreferences({ units: { default: 'SI' } }), { units: 'SI' });
  });

  it('extracts default when default happens to be a number from an allowed set', () => {
    assert.deepEqual(extractDefaultPreferences({ precision: { default: 4 } }), { precision: 4 });
  });
});
