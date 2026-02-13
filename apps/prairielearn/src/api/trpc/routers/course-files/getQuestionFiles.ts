import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { selectCourseById } from '../../../../models/course.js';
import { selectQuestionById } from '../../../../models/question.js';
import { privateProcedure } from '../../trpc.js';

/**
 * Returns base64-encoded `question.html` and `server.py` files for a question.
 *
 * This procedure assumes internal-only access (e.g., authenticated via the
 * course-files API secret). Do not expose it directly to user-controlled clients.
 */
export const getQuestionFiles = privateProcedure
  .input(
    z.object({
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

    assert(question.course_id === course.id);
    assert(question.qid);

    const questionPath = path.join(course.path, 'questions', question.qid);

    const files: Record<string, string> = {};

    // In the future, we should support more than just these two files. For now,
    // this is sufficient.
    for (const filePath of ['question.html', 'server.py']) {
      try {
        files[filePath] = (await fs.readFile(path.join(questionPath, filePath))).toString('base64');
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }

    return { files };
  });
