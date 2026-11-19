import { getSingularPatch } from '@pierre/diffs';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { parseChatDiff, remarkCompleteDiffs } from './parseChatDiff.js';

describe('parseChatDiff', () => {
  it('splits Git output into files and keeps the commit details', () => {
    const diff = parseChatDiff(
      [
        'commit fea005d',
        'Author: Staff <staff@example.com>',
        '',
        '    Fix the answer',
        '',
        'diff --git a/questions/add/server.py b/questions/add/server.py',
        'index 1111111..2222222 100644',
        '--- a/questions/add/server.py',
        '+++ b/questions/add/server.py',
        '@@ -3,3 +3,3 @@ def generate(data):',
        '     a = 1',
        '-    b = 2',
        '+    b = 3',
        '     c = a + b',
        'diff --git a/notes.md b/notes.md',
        'new file mode 100644',
        'index 0000000..3333333',
        '--- /dev/null',
        '+++ b/notes.md',
        '@@ -0,0 +1,2 @@',
        '+one',
        '+two',
        'diff --git a/figure.png b/figure.png',
        'index 4444444..5555555 100644',
        'Binary files a/figure.png and b/figure.png differ',
        '',
      ].join('\n'),
    );
    expect(diff?.preamble).toBe(
      'commit fea005d\nAuthor: Staff <staff@example.com>\n\n    Fix the answer',
    );
    expect(diff?.files).toMatchObject([
      {
        path: 'questions/add/server.py',
        change: 'modified',
        additions: 1,
        deletions: 1,
        numbered: true,
      },
      { path: 'notes.md', change: 'added', additions: 2, deletions: 0 },
      { path: 'figure.png', change: 'modified', patch: null },
    ]);
    expect(diff?.files[0].patch).toBe(
      [
        '--- questions/add/server.py',
        '+++ questions/add/server.py',
        '@@ -3,3 +3,3 @@',
        '     a = 1',
        '-    b = 2',
        '+    b = 3',
        '     c = a + b',
        '',
      ].join('\n'),
    );
    expect(diff?.files[1].patch).toContain('--- /dev/null\n+++ notes.md\n@@ -0,0 +1,2 @@');
  });

  it('accepts changed lines with no file or hunk header', () => {
    const diff = parseChatDiff('-<p>Old wording.</p>\n+<p>New wording.</p>\n');
    expect(diff).toEqual({
      preamble: '',
      files: [
        {
          path: '',
          change: 'modified',
          patch:
            '--- file\n+++ file\n@@ -1,1 +1,1 @@\n-<p>Old wording.</p>\n+<p>New wording.</p>\n',
          additions: 1,
          deletions: 1,
          numbered: false,
        },
      ],
    });
  });

  it('repairs hand-written hunks', () => {
    const diff = parseChatDiff(
      [
        '--- a/info.json',
        '+++ b/info.json',
        // The counts are wrong, a context line has lost its leading space, and one is blank.
        '@@ -10,9 +10,2 @@',
        '{',
        '-  "title": "Old",',
        '+  "title": "New",',
        '',
        '   "topic": "Algebra"',
        '',
        '--- a/b.txt',
        '+++ b/b.txt',
        '@@ -1 +1 @@',
        '--- not a file header',
        '+++ still not one',
        '',
      ].join('\n'),
    );
    expect(diff?.files.map((file) => file.patch)).toEqual([
      '--- info.json\n+++ info.json\n@@ -10,4 +10,4 @@\n {\n-  "title": "Old",\n+  "title": "New",\n \n   "topic": "Algebra"\n',
      '--- b.txt\n+++ b.txt\n@@ -1,1 +1,1 @@\n--- not a file header\n+++ still not one\n',
    ]);
  });

  it('uses the known file for a diff that names none', () => {
    const added = parseChatDiff('@@ -0,0 +1,2 @@\n+{\n+}', { path: 'info.json', change: 'added' });
    expect(added?.files).toMatchObject([{ path: 'info.json', change: 'added', numbered: true }]);
    expect(added?.files[0].patch).toBe('--- /dev/null\n+++ info.json\n@@ -0,0 +1,2 @@\n+{\n+}\n');
  });

  it('gives the viewer a patch it can read', () => {
    const texts = [
      '-old\n+new\n',
      '@@ -1 +1,2 @@\n-<p>Old</p>\n+<p>New</p>\n+<p>More</p>',
      '--- a/a.py\n+++ b/a.py\n@@ -1,99 +1,99 @@\nimport math\n-x = 1\n+x = 2\n\\ No newline at end of file\n',
      '--- a/gone.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-one\n-two\n',
    ];
    for (const text of texts) {
      const [file] = parseChatDiff(text)!.files;
      const patch = getSingularPatch(file.patch!);
      expect(patch.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0)).toBe(file.additions);
      expect(patch.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0)).toBe(file.deletions);
    }
  });

  it('leaves text without changed lines, and very large diffs, as plain text', () => {
    expect(parseChatDiff(' questions/add/server.py | 2 +-\n 1 file changed\n')).toBeNull();
    expect(parseChatDiff('')).toBeNull();
    expect(parseChatDiff(`+${'x'.repeat(100_000)}`)).toBeNull();
  });
});

describe('remarkCompleteDiffs', () => {
  const completeDiffs = (markdown: string) => {
    const processor = unified().use(remarkParse).use(remarkCompleteDiffs);
    const complete: boolean[] = [];
    const visit = (node: { type: string; data?: object; children?: unknown[] }) => {
      if (node.type === 'code') {
        complete.push(JSON.stringify(node.data ?? {}).includes('dataCompleteDiff'));
      }
      for (const child of node.children ?? []) visit(child as Parameters<typeof visit>[0]);
    };
    visit(processor.runSync(processor.parse(markdown), markdown));
    return complete;
  };

  it('marks only finished diff blocks', () => {
    expect(completeDiffs('```diff\n-a\n+b\n```\n')).toEqual([true]);
    expect(completeDiffs('1. Change:\n\n   ```diff\n   -a\n   +b\n   ```\n')).toEqual([true]);
    expect(completeDiffs('> ~~~patch\n> -a\n> ~~~')).toEqual([true]);
    // Still streaming: no closing fence yet, or a fence too short to close the block.
    expect(completeDiffs('```diff\n-a\n+b\n')).toEqual([false]);
    expect(completeDiffs('```diff')).toEqual([false]);
    expect(completeDiffs('````diff\n-a\n```\n')).toEqual([false]);
    expect(completeDiffs('```python\nx = 1\n```\n')).toEqual([false]);
  });
});
