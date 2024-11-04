import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { QuestionAddEditor, QuestionModifyEditor } from '../../../../../lib/editors.js';
import { selectQuestionByUuid } from '../../../../../models/question.js';

const router = Router({ mergeParams: true });

const CreateQuestionSchema = z.object({
  qid: z.string().optional(),
  title: z.string().optional(),
  files: z.record(z.string()),
});

const UpdateQuestionSchema = z.object({
  files: z.record(z.string()),
});

// Create a new question.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateQuestionSchema.parse(req.body);

    const editor = new QuestionAddEditor({
      // TODO: type/populate better?
      locals: {},
      // TODO: pull files from request.
      files: {},
    });

    const serverJob = await editor.prepareServerJob();

    await editor.executeWithServerJob(serverJob);

    const question = await selectQuestionByUuid({
      course_id: res.locals.course.id,
      uuid: editor.uuid,
    });

    res.json({ question_id: question.id });
  }),
);

// Update an existing question.
router.post(
  '/:question_id',
  asyncHandler(async (req, res) => {
    const body = UpdateQuestionSchema.parse(req.body);

    // TODO: this does not exist yet.
    const editor = new QuestionModifyEditor({
      // TODO: type/populate better?
      locals: {},
      // TODO: pull files from request.
      files: {},
    });

    const serverJob = await editor.prepareServerJob();

    await editor.executeWithServerJob(serverJob);
  }),
);

export default router;
