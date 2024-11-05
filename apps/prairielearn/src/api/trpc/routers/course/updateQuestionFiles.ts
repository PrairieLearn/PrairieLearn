import { z } from 'zod';

import { QuestionModifyEditor } from '../../../../lib/editors.js';
import { courseProcedure, privateProcedure, userProcedure } from '../../trpc.js';

export const updateQuestionFiles = privateProcedure
  // TODO: this loses inference on the input type.
  .unstable_concat(courseProcedure)
  .unstable_concat(userProcedure)
  .input(
    z.object({
      files: z.record(z.string()),
    }),
  )
  .output(
    z.object({
      status: z.union([z.literal('success'), z.literal('error')]),
      job_sequence_id: z.string(),
    }),
  )
  .mutation(async (opts) => {
    const editor = new QuestionModifyEditor({
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

    return {
      status: 'success',
      job_sequence_id: serverJob.jobSequenceId,
    };
  });
