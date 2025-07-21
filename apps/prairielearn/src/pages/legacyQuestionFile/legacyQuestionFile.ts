import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import * as chunks from '../../lib/chunks.js';
import * as filePaths from '../../lib/file-paths.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    const question = res.locals.question;
    const course = res.locals.course;
    const filename = req.params.filename;
    const access_allowed = await sqldb.queryRow(
      sql.check_client_files,
      {
        question_id: question.id,
        filename,
      },
      z.boolean(),
    );
    if (!access_allowed) {
      throw new error.HttpStatusError(403, 'Access denied');
    }

    const coursePath = chunks.getRuntimeDirectoryForCourse(course);

    const questionIds = await chunks.getTemplateQuestionIds(question);

    const templateQuestionChunks = questionIds.map((id) => ({
      type: 'question' as const,
      questionId: id,
    }));
    const chunksToLoad: chunks.Chunk[] = [
      {
        type: 'question' as const,
        questionId: question.id,
      },
    ].concat(templateQuestionChunks);
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
