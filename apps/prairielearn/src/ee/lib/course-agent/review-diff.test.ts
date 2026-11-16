import { describe, expect, it } from 'vitest';

import { createReviewDiffFile } from './review-diff.js';

const base64 = (text: string) => Buffer.from(text).toString('base64');

describe('createReviewDiffFile', () => {
  it('diffs added, modified, and deleted text files', () => {
    const added = createReviewDiffFile('a.txt', null, base64('new\n'));
    expect(added).toMatchObject({ path: 'a.txt', change: 'added', bytes: 4 });
    expect(added.patch).toContain('--- /dev/null\n+++ a.txt');
    expect(added.patch).toContain('+new');

    const modified = createReviewDiffFile('b.txt', Buffer.from('old\n'), base64('new\n'));
    expect(modified).toMatchObject({ change: 'modified', bytes: 4 });
    expect(modified.patch).toContain('-old\n+new');

    const deleted = createReviewDiffFile('c.txt', Buffer.from('gone!\n'), undefined);
    expect(deleted).toMatchObject({ change: 'deleted', bytes: 6 });
    expect(deleted.patch).toContain('--- c.txt\n+++ /dev/null');
  });

  it('omits the patch when either side is binary', () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    expect(createReviewDiffFile('a.png', null, image.toString('base64'))).toEqual({
      path: 'a.png',
      change: 'added',
      bytes: 6,
      patch: null,
    });
    expect(createReviewDiffFile('b.txt', image, base64('text\n'))).toMatchObject({
      change: 'modified',
      patch: null,
    });
  });
});
