import { createReadStream } from 'node:fs';
import { mkdtempDisposable } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import { assert, describe, expect, it } from 'vitest';

import { writeWorkspaceGradedFilesArchive } from './graded-files.js';

describe('writeWorkspaceGradedFilesArchive', () => {
  it('rejects a source read error and closes the output and queued sources', async () => {
    await using directory = await mkdtempDisposable(path.join(os.tmpdir(), 'workspace-archive-'));
    // Reading a directory produces a real filesystem read error after the stream opens.
    const source = createReadStream(directory.path);
    const queuedSource = new Readable({ read() {} });
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    await expect(
      writeWorkspaceGradedFilesArchive(
        [
          { path: 'answer.py', createReadStream: () => source },
          { path: 'queued.py', createReadStream: () => queuedSource },
        ],
        output,
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });

    assert.isTrue(source.closed);
    assert.isTrue(queuedSource.closed);
    assert.isTrue(output.closed);
  });

  it('closes sources when the output fails', async () => {
    const source = new Readable({ read() {} });
    const error = new Error('Output failed');
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error);
      },
    });

    await expect(
      writeWorkspaceGradedFilesArchive(
        [{ path: 'answer.py', createReadStream: () => source }],
        output,
      ),
    ).rejects.toBe(error);

    assert.isTrue(source.closed);
    assert.isTrue(output.closed);
  });
});
