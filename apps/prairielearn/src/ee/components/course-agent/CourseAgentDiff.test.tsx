import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CourseAgentDiff,
  CourseAgentDiffSummary,
  parseCourseAgentDiff,
} from './CourseAgentDiff.js';

const diff = [
  'diff --git a/questions/example/question.html b/questions/example/question.html',
  'index 1234567..7654321 100644',
  '--- a/questions/example/question.html',
  '+++ b/questions/example/question.html',
  '@@ -1,2 +1,2 @@',
  '-old text',
  '+++ added text resembling a header',
  ' unchanged',
].join('\n');

describe('course-agent diff review', () => {
  it('counts changes without interpreting hunk contents as Git metadata', () => {
    expect(parseCourseAgentDiff(diff)).toEqual([
      {
        path: 'questions/example/question.html',
        additions: 1,
        deletions: 1,
        lines: ['@@ -1,2 +1,2 @@', '-old text', '+++ added text resembling a header', ' unchanged'],
      },
    ]);
  });

  it('renders contiguous lines without inline-code styling or Git metadata', () => {
    const html = renderToStaticMarkup(<CourseAgentDiff diff={diff} />);
    expect(html).not.toContain('<code');
    expect(html).not.toContain('diff --git');
    expect(html).not.toContain('index 1234567');
    expect(html).toContain('course-agent-diff-addition');
    expect(html).toContain('course-agent-diff-deletion');
    expect(renderToStaticMarkup(<CourseAgentDiffSummary diff={diff} />)).toContain(
      '1 additions, 1 deletions',
    );
  });

  it('keeps deleted and binary files in the review', () => {
    expect(
      parseCourseAgentDiff(
        [
          'diff --git a/old.txt b/old.txt',
          'deleted file mode 100644',
          '--- a/old.txt',
          '+++ /dev/null',
          '@@ -1 +0,0 @@',
          '-old',
          'diff --git a/image.png b/image.png',
          'GIT binary patch',
          'literal 12',
          'encoded bytes',
        ].join('\n'),
      ),
    ).toEqual([
      { path: 'old.txt', additions: 0, deletions: 1, lines: ['@@ -1 +0,0 @@', '-old'] },
      { path: 'image.png', additions: 0, deletions: 0, lines: ['Binary file changed'] },
    ]);
  });
});
