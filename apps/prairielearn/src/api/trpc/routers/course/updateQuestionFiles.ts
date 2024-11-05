import { z } from 'zod';

import { QuestionModifyEditor } from '../../../../lib/editors.js';
import { selectCourseById } from '../../../../models/course.js';
import { privateProcedure, selectUsers } from '../../trpc.js';

export const updateQuestionFiles = privateProcedure
  .input(
    z.object({
      // Context.
      course_id: z.string(),
      user_id: z.string(),
      authn_user_id: z.string(),

      // Question data.
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
    const course = await selectCourseById(opts.input.course_id);

    const { user, authn_user } = await selectUsers({
      user_id: opts.input.user_id,
      authn_user_id: opts.input.authn_user_id,
    });

    const editor = new QuestionModifyEditor({
      locals: {
        authz_data: {
          // TODO: real data.
          has_course_permission_edit: false,
          authn_user,
        },
        course,
        user,
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
