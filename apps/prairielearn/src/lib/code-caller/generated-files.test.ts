import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { logger } from '@prairielearn/logger';

import { file } from '../../question-servers/freeform.js';
import { withConfig } from '../../tests/utils/config.js';
import * as chunks from '../chunks.js';
import { type Course, type Question, type Variant } from '../db-types.js';

import { type CodeCaller } from './code-caller-shared.js';

import * as codeCallers from './index.js';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'generated-files-'));
  await mkdir(path.join(root, 'questions/test'), { recursive: true });
  await writeFile(path.join(root, 'questions/test/question.html'), '<p>Question</p>');
  await writeFile(path.join(root, 'questions/test/server.py'), '');
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => rm(root, { recursive: true, force: true }));

describe('generated file decoding', () => {
  it.each(['element', 'server'])(
    'reports invalid %s output as a fatal course issue',
    async (source) => {
      const call = vi.fn<CodeCaller['call']>(async (...args) => ({
        result:
          args[2] === 'server'
            ? {}
            : {
                data: args[4][1],
                file: source === 'element' ? {} : '',
                processed_elements: [],
              },
        output: '',
      }));
      const caller: CodeCaller = {
        uuid: 'test',
        getCoursePath: () => root,
        prepareForCourse: vi.fn(),
        call,
        restart: vi.fn(),
        done: vi.fn(),
      };
      vi.spyOn(chunks, 'getRuntimeDirectoryForCourse').mockReturnValue(root);
      vi.spyOn(chunks, 'ensureChunksForCourseAsync').mockResolvedValue();
      vi.spyOn(codeCallers, 'withCodeCaller').mockImplementation(async (_, fn) => fn(caller));
      vi.spyOn(logger, 'error').mockImplementation(() => {});

      const result = await withConfig({ devMode: true }, () =>
        file(
          'image.png',
          {
            id: '1',
            variant_seed: '1',
            preferences: {},
            options: {},
            num_tries: 0,
          } as Variant,
          null,
          { id: '1', directory: 'test', course_id: '1' } as Question,
          { id: '1', questions_receive_user_data: false } as Course,
          { userId: null, groupId: null, variantCourse: { id: '1' } },
        ),
      );

      expect(result.data).toEqual(Buffer.from(''));
      expect(result.courseIssues).toHaveLength(1);
      expect(result.courseIssues[0]).toMatchObject({ fatal: true, cause: expect.any(TypeError) });
      expect(call).toHaveBeenCalledTimes(source === 'element' ? 1 : 2);
    },
  );
});
