import { getSingularPatch } from '@pierre/diffs';
import { describe, expect, it } from 'vitest';

import { parseChatDiff } from './parseChatDiff.js';

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

  it('tells file names from the lines of a hunk', () => {
    // A removed `-- marker` and an added `++ marker`, inside a hunk that says it has both.
    const marker = parseChatDiff('@@ -1 +1 @@\n--- marker\n+++ marker\n');
    expect(marker?.files).toMatchObject([{ path: '', additions: 1, deletions: 1 }]);
    // A context line straight after the file names, with no hunk header before it.
    const context = parseChatDiff('--- a/a.py\n+++ b/a.py\nimport math\n-x = 1\n+x = 2\n');
    expect(context?.files[0].patch).toBe(
      '--- a.py\n+++ a.py\n@@ -1,2 +1,2 @@\n import math\n-x = 1\n+x = 2\n',
    );
  });

  it('uses the known file for a diff that names none', () => {
    const added = parseChatDiff('@@ -0,0 +1,2 @@\n+{\n+}', {
      known: { path: 'info.json', change: 'added' },
    });
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

  it('shows a streaming diff as far as it has come', () => {
    const text = [
      '--- a/info.json',
      '+++ b/info.json',
      '@@ -2,2 +2,2 @@',
      '-  "title": "Old",',
      '+  "title": "New",',
      '--- a/b.txt',
      '+++ b/b.txt',
      '-old',
    ].join('\n');
    const shown = (end: string) => {
      const diff = parseChatDiff(text.slice(0, text.indexOf(end) + end.length), {
        streaming: true,
      });
      return diff?.files.map((file) => `${file.path}: +${file.additions} -${file.deletions}`);
    };
    // A header is not read as a removed line while the lines after it are still to come.
    expect(shown('--- a/info')).toBeUndefined();
    expect(shown('+++ b/info.json')).toBeUndefined();
    expect(shown('@@ -2,2 +2,2 @@')).toBeUndefined();
    expect(shown('-  "tit')).toEqual(['info.json: +0 -1']);
    expect(shown('"New",\n-')).toEqual(['info.json: +1 -1']);
    expect(shown('--- a/b.txt')).toEqual(['info.json: +1 -1']);
    expect(shown('+++ b/b.txt')).toEqual(['info.json: +1 -1']);
    expect(shown('-old')).toEqual(['info.json: +1 -1', 'b.txt: +0 -1']);
  });

  it("keeps a commit's details out of the diff while its files stream in", () => {
    const streaming = parseChatDiff('commit fea005d\nAuthor: Staff\n\n    Fix the answer\n', {
      streaming: true,
    });
    expect(streaming).toEqual({
      preamble: 'commit fea005d\nAuthor: Staff\n\n    Fix the answer',
      files: [],
    });
  });

  it('shows lines with no changes, and leaves empty and very large text as plain text', () => {
    const summary = parseChatDiff(' questions/add/server.py | 2 +-\n 1 file changed\n');
    expect(summary?.files).toMatchObject([{ path: '', additions: 0, deletions: 0 }]);
    // A finished diff that only names its files still shows them.
    const named = '--- a/one.txt\n+++ b/one.txt\n--- /dev/null\n+++ b/two.txt\n';
    expect(parseChatDiff(named)?.files).toMatchObject([
      { path: 'one.txt', change: 'modified', additions: 0 },
      { path: 'two.txt', change: 'added', additions: 0 },
    ]);
    expect(parseChatDiff(named, { streaming: true })).toBeNull();
    expect(parseChatDiff('')).toBeNull();
    expect(parseChatDiff('', { streaming: true })).toBeNull();
    expect(parseChatDiff('commit fea005d\nAuthor: Staff\n')).toBeNull();
    expect(parseChatDiff(`+${'x'.repeat(100_000)}`)).toBeNull();
  });
});
