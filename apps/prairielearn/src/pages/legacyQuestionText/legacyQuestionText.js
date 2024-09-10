// @ts-check
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as chunks from '../../lib/chunks.js';
import * as filePaths from '../../lib/file-paths.js';

const router = Router();

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    const question = res.locals.question;
    const course = res.locals.course;
    const filename = 'text/' + req.params.filename;
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);

    const questionIds = await chunks.getTemplateQuestionIds(question);

    /** @type {chunks.Chunk[]} */
    const templateQuestionChunks = questionIds.map((id) => ({
      type: 'question',
      questionId: id,
    }));
    const chunksToLoad =
      /** @type {chunks.Chunk[]} */
      ([
        {
          type: 'question',
          questionId: question.id,
        },
      ]).concat(templateQuestionChunks);
    await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);

    const { rootPath, effectiveFilename } = await filePaths.questionFilePath(
      filename,
      question.directory,
      coursePath,
      question,
    );

    res.sendFile(effectiveFilename, { root: rootPath });
  }),
);

export default router;
