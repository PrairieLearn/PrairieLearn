import { z } from 'zod';

import { QuestionAddEditor } from '../../../../lib/editors.js';
import { selectQuestionByUuid } from '../../../../models/question.js';
import { courseProcedure } from '../../trpc.js';

export const createQuestion = courseProcedure
  .output(
    z.object({
      question_id: z.string(),
    }),
  )
  .mutation(async (opts) => {
    const editor = new QuestionAddEditor({
      // TODO: type/populate better?
      locals: {},
      // TODO: pull files from request.
      files: {},
    });

    const serverJob = await editor.prepareServerJob();

    await editor.executeWithServerJob(serverJob);

    const question = await selectQuestionByUuid({
      course_id: opts.ctx.course.id,
      uuid: editor.uuid,
    });

    return {
      question_id: question.id,
    };
  });
