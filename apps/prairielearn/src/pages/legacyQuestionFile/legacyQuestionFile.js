// @ts-check
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import * as chunks from '../../lib/chunks.js';
import * as filePaths from '../../lib/file-paths.js';

var sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    const question = res.locals.question;
    const course = res.locals.course;
    const filename = req.params.filename;
    const result = await sqldb.queryOneRowAsync(sql.check_client_files, {
      question_id: question.id,
      filename,
    });
    if (!result.rows[0].access_allowed) {
      throw new error.HttpStatusError(403, 'Access denied');
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(course);

    const questionIds = await chunks.getTemplateQuestionIds(question);

    /** @type {chunks.Chunk[]} */
    const templateQuestionChunks = questionIds.map((id) => ({
      type: 'question',
      questionId: id,
    }));
    const chunksToLoad = /** @type {chunks.Chunk[]} */ ([
      {
        type: /** @type {const} */ ('question'),
        questionId: question.id,
      },
    ]).concat(templateQuestionChunks);
    await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);

    const { effectiveFilename, rootPath } = await filePaths.questionFilePath(
      filename,
      question.directory,
      coursePath,
      question,
    );
    res.sendFile(effectiveFilename, { root: rootPath });
  }),
);

export default router;
