import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { setupShortNameSuggestion } from './shortNameSuggestion.js';

describe('setupShortNameSuggestion', () => {
  it('updates the short name from the title until the short name is edited', () => {
    const { window } = new JSDOM(`
      <input id="title" />
      <input id="short-name" />
    `);
    const titleInput = window.document.querySelector<HTMLInputElement>('#title')!;
    const shortNameInput = window.document.querySelector<HTMLInputElement>('#short-name')!;
    setupShortNameSuggestion(titleInput, shortNameInput);

    titleInput.value = 'Foo bar';
    titleInput.dispatchEvent(new window.Event('input'));
    expect(shortNameInput.value).toBe('foo-bar');

    titleInput.value = 'Foo bar quiz';
    titleInput.dispatchEvent(new window.Event('input'));
    expect(shortNameInput.value).toBe('foo-bar-quiz');

    shortNameInput.value = 'quiz1';
    shortNameInput.dispatchEvent(new window.Event('input'));
    titleInput.value = 'Updated title';
    titleInput.dispatchEvent(new window.Event('input'));
    expect(shortNameInput.value).toBe('quiz1');
  });
});
