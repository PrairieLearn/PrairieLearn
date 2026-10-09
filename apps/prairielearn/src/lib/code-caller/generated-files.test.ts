import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleInput } from '../../executor-lib.js';

import { CodeCallerNative } from './code-caller-native.js';

let root: string;
let caller: CodeCallerNative;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'generated-files-'));
  await mkdir(path.join(root, 'questions/test'), { recursive: true });
  await writeFile(
    path.join(root, 'questions/test/server.py'),
    'import io\ndef file(data):\n    return io.BytesIO(b"abcd")\n',
  );
  await mkdir(path.join(root, 'elements/generated-file'), { recursive: true });
  await writeFile(
    path.join(root, 'elements/generated-file/generated-file.py'),
    'import io\ndef file(element_html, data):\n    return io.BytesIO(b"abcd")\n',
  );
});

beforeEach(async () => {
  caller = await CodeCallerNative.create({
    dropPrivileges: false,
    questionTimeoutMilliseconds: 10_000,
    pingTimeoutMilliseconds: 10_000,
    errorLogger: () => {},
  });
  await caller.prepareForCourse({ coursePath: root, forbiddenModules: [] });
});

afterEach(() => caller.done());
afterAll(async () => rm(root, { recursive: true, force: true }));

describe.each(['server', 'question.html'])('generated file transport via %s', (file) => {
  function requestArgs() {
    if (file === 'server') return [{}];
    return [
      {
        html: '<generated-file></generated-file>',
        elements: {
          'generated-file': {
            name: 'generated-file',
            controller: 'generated-file.py',
            type: 'course',
          },
        },
        element_extensions: {},
        course_path: root,
      },
      { options: {} },
    ];
  }

  it('preserves unlimited file generation and accepts files exactly at the limit', async () => {
    const unlimited = await caller.call('question', 'test', file, 'file', requestArgs());
    const limited = await caller.call('question', 'test', file, 'file', requestArgs(), 4);
    const expected = Buffer.from('abcd').toString('base64');
    expect(file === 'server' ? unlimited.result : unlimited.result.file).toBe(expected);
    expect(limited.result).toEqual(unlimited.result);
  });

  it('passes the executor limit to Python and rejects oversized files before transport', async () => {
    vi.spyOn(caller, 'prepareForCourse').mockResolvedValue();
    const result = await handleInput(
      JSON.stringify({
        type: 'question',
        directory: 'test',
        file,
        fcn: 'file',
        args: requestArgs(),
        forbidden_modules: [],
        max_file_bytes: 3,
      }),
      caller,
    );
    expect(result.error).toBeDefined();
    expect(result.errorData?.outputStderr).toContain('Generated file exceeds the size limit');
    expect(result.errorData?.outputData).toBe('');
  });
});
