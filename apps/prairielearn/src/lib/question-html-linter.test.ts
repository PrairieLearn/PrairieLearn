import { describe, expect, it } from 'vitest';

import { lintQuestionHtml } from './question-html-linter.js';

describe('lintQuestionHtml', () => {
  it('returns no diagnostics for clean question HTML', async () => {
    const html = [
      '<pl-question-panel>',
      '<p>What is 2+2?</p>',
      '</pl-question-panel>',
      '',
      '<pl-multiple-choice answers-name="answer">',
      '  <pl-answer correct="true">4</pl-answer>',
      '  <pl-answer correct="false">5</pl-answer>',
      '</pl-multiple-choice>',
    ].join('\n');
    const diagnostics = await lintQuestionHtml(html);
    expect(diagnostics).toEqual([]);
  });

  it('warns on relative clientFilesQuestion paths', async () => {
    const html = '<img src="clientFilesQuestion/image.png">';
    const diagnostics = await lintQuestionHtml(html);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.message.includes('clientFilesQuestion'))).toBe(true);
  });

  it('warns on raw <img> tags that should use pl-figure', async () => {
    const html = '<img src="foo.png">';
    const diagnostics = await lintQuestionHtml(html);
    expect(diagnostics.some((d) => d.message.includes('pl-figure'))).toBe(true);
  });

  it('warns on remote image URLs without suggesting pl-figure', async () => {
    const html = '<img src="https://example.com/image.png">';
    const diagnostics = await lintQuestionHtml(html);
    expect(
      diagnostics.some((d) => d.message.includes('remote URL') && d.severity === 'warning'),
    ).toBe(true);
    expect(diagnostics.some((d) => d.message.includes('pl-figure'))).toBe(false);
  });

  it('warns on malformed remote image URLs without suggesting pl-figure', async () => {
    const html = '<img src="://example.com/image.png">';
    const diagnostics = await lintQuestionHtml(html);
    expect(
      diagnostics.some((d) => d.message.includes('remote URL') && d.severity === 'warning'),
    ).toBe(true);
    expect(diagnostics.some((d) => d.message.includes('pl-figure'))).toBe(false);
  });

  it('flags input elements missing answers-name', async () => {
    const html = '<pl-string-input></pl-string-input>';
    const diagnostics = await lintQuestionHtml(html);
    expect(diagnostics.some((d) => d.message.includes('answers-name'))).toBe(true);
  });
});
