import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from 'fs-extra';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { selectCourseById } from '../../../../models/course.js';
import { selectQuestionById } from '../../../../models/question.js';
import { privateProcedure } from '../../trpc.js';

/**
 * Returns base64-encoded `question.html` and `server.py` files for a question.
 */
export const getQuestionFiles = privateProcedure
  .input(
    z.object({
      // TODO: is there any security to think through here?
      course_id: IdSchema,
      question_id: IdSchema,
    }),
  )
  .output(
    z.object({
      files: z.record(z.string()),
    }),
  )
  .query(async (opts) => {
    const course = await selectCourseById(opts.input.course_id);
    const question = await selectQuestionById(opts.input.question_id);

    assert(question.qid);
    const questionPath = path.join(course.path, 'questions', question.qid);

    const files: Record<string, string> = {};

    // TODO: support more than just these two files.
    if (await pathExists(path.join(questionPath, 'question.html'))) {
      files['question.html'] = (
        await fs.readFile(path.join(questionPath, 'question.html'))
      ).toString('base64');
    }

    if (await pathExists(path.join(questionPath, 'server.py'))) {
      files['server.py'] = (await fs.readFile(path.join(questionPath, 'server.py'))).toString(
        'base64',
      );
    }

    return { files };
  });
