import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CodeCallerNative } from './code-caller-native.js';

describe('CodeCallerNative timeouts', () => {
  let codeCaller: CodeCallerNative;

  beforeEach(async () => {
    codeCaller = await CodeCallerNative.create({
      dropPrivileges: false,
      questionTimeoutMilliseconds: 100,
      pingTimeoutMilliseconds: 60_000,
      errorLogger: console.error,
    });
    codeCaller.options.pingTimeoutMilliseconds = 20;
  });

  afterEach(() => codeCaller.done());

  it('reads a buffered reply after an event loop stall without timing out the next call', async () => {
    const response = codeCaller.call('ping', null, null, 'ping', []);
    const nextResponse = response.then(() => {
      codeCaller.options.pingTimeoutMilliseconds = 60_000;
      return codeCaller.call('ping', null, null, 'ping', []);
    });

    // Let Python reply while Node cannot process either the pipe or the expired timer.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);

    expect(await nextResponse).toEqual({ result: 'pong', output: '' });
  });

  it('times out a call that does not reply', async () => {
    await tmp.withDir(
      async ({ path: coursePath }) => {
        const questionPath = path.join(coursePath, 'questions', 'hang');
        await mkdir(questionPath, { recursive: true });
        await writeFile(
          path.join(questionPath, 'server.py'),
          'import time\ndef generate(data):\n    time.sleep(60)\n',
        );
        await codeCaller.prepareForCourse({ coursePath, forbiddenModules: [] });

        await expect(
          codeCaller.call('question', 'hang', 'server', 'generate', [{}]),
        ).rejects.toThrow('timeout exceeded, killing CodeCallerNative child');
      },
      { unsafeCleanup: true },
    );
  });
});
