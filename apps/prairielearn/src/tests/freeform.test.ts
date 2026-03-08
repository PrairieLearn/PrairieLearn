import { describe, expect, it } from 'vitest';

import { extractDefaultPreferences } from '../lib/question-preferences.js';

describe('extractDefaultPreferences', () => {
  it('extracts defaults from schema', () => {
    const schema = {
      theme: { default: 'light' },
      fontSize: { default: 12 },
      showHints: { default: true },
    };
    expect(extractDefaultPreferences(schema)).toEqual({
      theme: 'light',
      fontSize: 12,
      showHints: true,
    });
  });

  it('returns empty object when schema is null', () => {
    expect(extractDefaultPreferences(null)).toEqual({});
  });

  it('returns empty object when schema is undefined', () => {
    expect(extractDefaultPreferences(undefined)).toEqual({});
  });

  it('returns empty object for empty schema', () => {
    expect(extractDefaultPreferences({})).toEqual({});
  });
});
