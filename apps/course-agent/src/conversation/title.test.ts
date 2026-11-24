import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_TITLE_INPUT_LENGTH,
  MAX_TITLE_LENGTH,
  generateTitle,
  normalizeTitle,
} from './title.js';

afterEach(() => vi.unstubAllGlobals());

describe('generateTitle', () => {
  it('sends only the start of a long message', async () => {
    const fetch = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Edit a question' }] }],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const message = '😀'.repeat(MAX_TITLE_INPUT_LENGTH + 10);
    expect(await generateTitle({ apiKey: 'key', model: 'model', message })).toBe('Edit a question');
    const { input } = JSON.parse(fetch.mock.calls[0][1].body as string) as { input: string };
    expect(input).toBe('😀'.repeat(MAX_TITLE_INPUT_LENGTH));
  });
});

describe('normalizeTitle', () => {
  it('strips quotes and trailing punctuation after trimming', () => {
    expect(normalizeTitle('"Fix derivative typo."\n')).toBe('Fix derivative typo');
    expect(normalizeTitle('“Revisar addNumbers”')).toBe('Revisar addNumbers');
  });

  it('keeps an apostrophe that does not wrap the title', () => {
    expect(normalizeTitle("Review students' answers")).toBe("Review students' answers");
  });

  it('caps long titles by code point without splitting surrogate pairs', () => {
    const title = normalizeTitle(`${'a'.repeat(MAX_TITLE_LENGTH - 4)}📚📚📚📚📚`);
    expect(title).toBe(`${'a'.repeat(MAX_TITLE_LENGTH - 4)}📚...`);
    expect([...title]).toHaveLength(MAX_TITLE_LENGTH);
  });
});
