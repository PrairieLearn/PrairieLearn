import { describe, expect, it } from 'vitest';

import { findPaperConcerns } from './print-preparation.js';

describe('paper preparation concerns', () => {
  it('flags tasks that depend on computers, files, and media', () => {
    const concerns = findPaperConcerns(
      '<pl-question-panel><pl-file-editor></pl-file-editor><pl-file-upload></pl-file-upload><pl-workspace></pl-workspace><video src="demo.mp4"></video><pl-file-download></pl-file-download></pl-question-panel>',
    );
    expect(concerns).toHaveLength(5);
    expect(concerns.join(' ')).toContain('code editor');
    expect(concerns.join(' ')).toContain('online workspace');
  });

  it('ignores answer-only content and comments', () => {
    expect(
      findPaperConcerns(
        '<pl-answer-panel><video></video></pl-answer-panel><pl-submission-panel><a href="https://example.com">feedback</a></pl-submission-panel><!-- <pl-workspace></pl-workspace> -->',
      ),
    ).toEqual([]);
  });

  it('does not flag ordinary equations, figures, or pencil-and-paper responses', () => {
    expect(
      findPaperConcerns(
        '<p>Calculate \\(x+1\\).</p><img src="plot.svg"><pl-code>Sample code to read</pl-code><pl-number-input></pl-number-input><pl-sketch></pl-sketch><pl-rich-text-editor></pl-rich-text-editor>',
      ),
    ).toEqual([]);
  });

  it('treats references as a review suggestion without declaring the question unprintable', () => {
    expect(findPaperConcerns('<p>Source: <a href="https://example.com">Example</a></p>')).toEqual([
      'Links to an online resource. Check whether students need it to answer.',
    ]);
  });
});
