import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@prairielearn/logger';

import { handleInput } from '../../executor-lib.js';
import { file } from '../../question-servers/freeform.js';
import { withConfig } from '../../tests/utils/config.js';
import * as chunks from '../chunks.js';
import { type Course, type Question, type Variant } from '../db-types.js';

import { CodeCallerNative } from './code-caller-native.js';

import * as codeCallers from './index.js';

let root: string;
let caller: CodeCallerNative;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'generated-files-'));
  await mkdir(path.join(root, 'questions/test'), { recursive: true });
  await writeFile(path.join(root, 'questions/test/question.html'), '<p>Question</p>');
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

afterEach(() => {
  vi.restoreAllMocks();
  caller.done();
});
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

it.each(['element', 'server'])(
  'reports oversized %s output as a fatal course issue',
  async (source) => {
    vi.spyOn(chunks, 'getRuntimeDirectoryForCourse').mockReturnValue(root);
    vi.spyOn(chunks, 'ensureChunksForCourseAsync').mockResolvedValue();
    vi.spyOn(codeCallers, 'withCodeCaller').mockImplementation(async (_, fn) => fn(caller));
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const call = vi.spyOn(caller, 'call').mockImplementation(async (...args) => ({
      result:
        args[2] === 'server'
          ? Buffer.from('abcd').toString('base64')
          : {
              data: args[4][1],
              file: source === 'element' ? Buffer.from('abcd').toString('base64') : '',
              processed_elements: [],
            },
      output: '',
    }));

    const result = await withConfig({ devMode: true }, () =>
      file({
        filename: 'image.png',
        question: { id: '1', directory: 'test', course_id: '1' } as Question,
        course: { id: '1', questions_receive_user_data: false } as Course,
        variant: {
          id: '1',
          variant_seed: '1',
          preferences: {},
          options: {},
          num_tries: 0,
        } as Variant,
        submission: null,
        caller: { userId: null, groupId: null, variantCourse: { id: '1' } },
        maxFileBytes: 3,
      }),
    );

    expect(result.data).toEqual(Buffer.from(''));
    expect(result.courseIssues).toHaveLength(1);
    expect(result.courseIssues[0]).toMatchObject({
      message: expect.stringContaining('Generated file exceeds the size limit of 3 bytes'),
      fatal: true,
    });
    expect(call).toHaveBeenCalledTimes(source === 'element' ? 1 : 2);
  },
);
