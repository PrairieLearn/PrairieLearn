import { describe, expect, it } from 'vitest';

import { getPreferences } from '../../src/question-servers/freeform.js';

describe('getPreferences', () => {
  it('returns preferences when provided', () => {
    const preferences = { theme: 'dark', fontSize: 14 };
    expect(getPreferences({ preferences })).toEqual({ theme: 'dark', fontSize: 14 });
  });

  it('returns preferences even when preferencesSchema is also provided', () => {
    const preferences = { theme: 'dark' };
    const preferencesSchema = { theme: { default: 'light' } };
    expect(getPreferences({ preferences, preferencesSchema })).toEqual({ theme: 'dark' });
  });

  it('extracts defaults from preferencesSchema when preferences is not provided', () => {
    const preferencesSchema = {
      theme: { default: 'light' },
      fontSize: { default: 12 },
      showHints: { default: true },
    };
    expect(getPreferences({ preferencesSchema })).toEqual({
      theme: 'light',
      fontSize: 12,
      showHints: true,
    });
  });

  it('extracts partial defaults from preferencesSchema when preferences is provided', () => {
    const preferencesSchema = {
      theme: { default: 'light' },
      fontSize: { default: 12 },
      showHints: { default: true },
    };
    expect(getPreferences({ preferencesSchema, preferences: { theme: 'dark' } })).toEqual({
      theme: 'dark',
      fontSize: 12,
      showHints: true,
    });
  });

  it('returns empty object when neither preferences nor preferencesSchema is provided', () => {
    expect(getPreferences({})).toEqual({});
  });

  it('returns empty object when preferences is null and preferencesSchema is null', () => {
    expect(getPreferences({ preferences: null, preferencesSchema: null })).toEqual({});
  });

  it('returns empty object for empty preferencesSchema', () => {
    expect(getPreferences({ preferencesSchema: {} })).toEqual({});
  });
});
