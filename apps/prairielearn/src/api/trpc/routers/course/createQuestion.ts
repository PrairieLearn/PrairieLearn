import { z } from 'zod';

import { QuestionAddEditor } from '../../../../lib/editors.js';
import { selectQuestionByUuid } from '../../../../models/question.js';
import { courseProcedure, privateProcedure, userProcedure } from '../../trpc.js';

export const createQuestion = privateProcedure
  // TODO: this loses inference on the input type.
  .unstable_concat(courseProcedure)
  .unstable_concat(userProcedure)
  .input(
    z.object({
      qid: z.string().optional(),
      title: z.string().optional(),
      files: z.record(z.string()).optional(),
    }),
  )
  .output(
    z.union([
      z.object({
        status: z.literal('success'),
        job_sequence_id: z.string(),
        question_id: z.string(),
      }),
      z.object({
        status: z.literal('error'),
        job_sequence_id: z.string(),
      }),
    ]),
  )
  .mutation(async (opts) => {
    const editor = new QuestionAddEditor({
      locals: {
        authz_data: {
          has_course_permission_edit: false,
          authn_user: opts.ctx.authn_user,
        },
        course: opts.ctx.course,
        user: opts.ctx.user,
      },
      files: opts.input.files,
    });

    const serverJob = await editor.prepareServerJob();

    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      return {
        status: 'error',
        job_sequence_id: serverJob.jobSequenceId,
      };
    }

    const question = await selectQuestionByUuid({
      course_id: opts.ctx.course.id,
      uuid: editor.uuid,
    });

    return {
      status: 'success',
      job_sequence_id: serverJob.jobSequenceId,
      question_id: question.id,
    };
  });
