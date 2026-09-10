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
        status: 'modified',
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
    expect(html).not.toContain('@@');
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
      {
        path: 'old.txt',
        status: 'deleted',
        additions: 0,
        deletions: 1,
        lines: ['@@ -1 +0,0 @@', '-old'],
      },
      {
        path: 'image.png',
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: ['Binary file changed'],
      },
    ]);
  });

  it('shows new files as ordinary code with an Added badge and no diff markers', () => {
    const html = renderToStaticMarkup(
      <CourseAgentDiff
        diff={[
          'diff --git a/questions/new/question.html b/questions/new/question.html',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/questions/new/question.html',
          '@@ -0,0 +1 @@',
          '+<p>A new question</p>',
        ].join('\n')}
      />,
    );
    expect(html).toContain('Added');
    expect(html).toContain('&lt;p&gt;A new question&lt;/p&gt;');
    expect(html).not.toContain('course-agent-diff-addition');
    expect(html).not.toContain('course-agent-diff-marker');
    expect(html).not.toContain('@@');
  });

  it('separates noncontiguous hunks without rendering raw Git headers', () => {
    const html = renderToStaticMarkup(
      <CourseAgentDiff diff={`${diff}\n@@ -20 +20 @@\n-later\n+updated`} />,
    );
    expect(html).toContain('role="separator"');
    expect(html).not.toContain('@@');
    expect(html).toContain('updated');
  });

  it('shows only aggregate counts without file paths or diff contents in the card', () => {
    const second = diff.replaceAll('example/question.html', 'second/question.html');
    const html = renderToStaticMarkup(<CourseAgentDiffSummary diff={`${diff}\n${second}`} />);
    expect(html).toContain('2 files changed');
    expect(html).toContain('Total: 2 additions, 2 deletions');
    expect(html).not.toContain('questions/example/question.html');
    expect(html).not.toContain('questions/second/question.html');
    expect(html).not.toContain('old text');
    expect(html).not.toContain('added text resembling a header');
  });
});
