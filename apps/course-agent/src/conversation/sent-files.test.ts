import { describe, expect, it, vi } from 'vitest';

import { MAX_CONVERSATION_ATTACHMENTS, type SentFilePart } from '@prairielearn/course-agent-types';

import { UploadQuota } from './attachments.js';
import { sendFiles } from './sent-files.js';

type Stat = { size: number } | { problem: string };

/** A conversation with room for `room` more sent files. */
function setup(stats: Record<string, Stat>, room = MAX_CONVERSATION_ATTACHMENTS) {
  const sandbox = {
    statFiles: vi.fn(async (paths: string[]) => paths.map((path) => stats[path])),
    storeFile: vi.fn<
      (
        path: string,
        size: number,
        key: string,
      ) => Promise<{ problem: string } | { mediaType: string | null }>
    >(async (path) => ({ mediaType: path.endsWith('.png') ? 'image/png' : null })),
  };
  const bucket = { delete: vi.fn(async () => {}) };
  const quota = new UploadQuota(async () => ({
    count: MAX_CONVERSATION_ATTACHMENTS - room,
    bytes: 0,
  }));
  const shown: SentFilePart[] = [];
  const send = (paths: string[], show = true) =>
    sendFiles({
      paths,
      conversationId: 'conversation',
      sandbox,
      bucket,
      quota,
      show: (files) => {
        if (show) shown.push(...files);
        return show;
      },
    });
  return { sandbox, bucket, quota, shown, send };
}

describe('send_files', () => {
  it('stores and shows every file, named by the last part of its path, with any image type', async () => {
    const { sandbox, shown, send } = setup({
      'data/grades.csv': { size: 12 },
      '/tmp/a.png': { size: 3 },
    });

    const reply = await send(['data/grades.csv', '/tmp/a.png']);

    expect(reply).toMatchObject({
      success: true,
      text: expect.stringContaining('grades.csv, a.png'),
    });
    expect(shown).toEqual([
      { id: expect.any(String), filename: 'grades.csv', size: 12 },
      { id: expect.any(String), filename: 'a.png', size: 3, mediaType: 'image/png' },
    ]);
    expect(sandbox.storeFile.mock.calls.map(([path, size, key]) => [path, size, key])).toEqual(
      shown.map(({ id }, index) => [
        ['data/grades.csv', '/tmp/a.png'][index],
        [12, 3][index],
        `uploads/conversation/sent/${id}`,
      ]),
    );
  });

  it('stores nothing when any file cannot be sent, and names each problem', async () => {
    const { sandbox, shown, send } = setup({
      'ok.csv': { size: 1 },
      missing: { problem: 'no such file' },
      'empty.txt': { size: 0 },
      'huge.bin': { size: 20 * 1024 * 1024 + 1 },
    });

    const reply = await send(['ok.csv', 'missing', 'empty.txt', 'huge.bin']);

    expect(reply).toEqual({
      success: false,
      text: 'No files were sent. missing: no such file; empty.txt: empty file; huge.bin: larger than 20 MB.',
    });
    expect(sandbox.storeFile).not.toHaveBeenCalled();
    expect(shown).toEqual([]);
  });

  it('refuses a call that does not fit under the cap, keeping the room that was left', async () => {
    const { sandbox, send } = setup({ a: { size: 1 }, b: { size: 1 }, c: { size: 1 } }, 2);

    expect(await send(['a', 'b', 'c'])).toMatchObject({
      success: false,
      text: expect.stringContaining('reached its limit'),
    });
    expect(sandbox.storeFile).not.toHaveBeenCalled();
    expect(await send(['a', 'b'])).toMatchObject({ success: true });
  });

  it.each([
    {
      name: 'a file cannot be read',
      fail: (storeFile: ReturnType<typeof setup>['sandbox']['storeFile']) =>
        storeFile
          .mockResolvedValueOnce({ mediaType: null })
          .mockResolvedValueOnce({ problem: 'permission denied' }),
      show: true,
      outcome: { success: false, text: 'No files were sent. b: permission denied.' },
    },
    {
      name: 'the turn ended while the files were stored',
      fail: () => {},
      show: false,
      outcome: { success: false, text: 'No files were sent. The turn ended first.' },
    },
  ])('deletes what it stored and frees its room when $name', async ({ fail, show, outcome }) => {
    const { sandbox, bucket, shown, send } = setup({ a: { size: 1 }, b: { size: 1 } }, 2);
    fail(sandbox.storeFile);

    expect(await send(['a', 'b'], show)).toEqual(outcome);

    expect(bucket.delete).toHaveBeenCalledWith(
      sandbox.storeFile.mock.calls.map(([, , key]) => key),
    );
    expect(shown).toEqual([]);
    expect(await send(['a', 'b'])).toMatchObject({ success: true });
  });

  it('deletes what it stored when a store fails, after every store has settled', async () => {
    const { sandbox, bucket, send } = setup({ a: { size: 1 }, b: { size: 1 } }, 2);
    let finishSlowStore = () => {};
    sandbox.storeFile
      .mockRejectedValueOnce(new Error('file changed size'))
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishSlowStore = () => resolve({ mediaType: null }))),
      );

    const reply = send(['a', 'b']);
    await vi.waitFor(() => expect(sandbox.storeFile).toHaveBeenCalledTimes(2));
    expect(bucket.delete).not.toHaveBeenCalled();
    finishSlowStore();

    await expect(reply).rejects.toThrow('file changed size');
    expect(bucket.delete).toHaveBeenCalledOnce();
    expect(await send(['a', 'b'])).toMatchObject({ success: true });
  });
});
