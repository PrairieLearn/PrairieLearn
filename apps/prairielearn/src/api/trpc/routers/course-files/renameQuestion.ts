import { z } from 'zod';

import { IdSchema } from '../../../../lib/db-types.js';
import { QuestionRenameEditor } from '../../../../lib/editors.js';
import { selectCourseById } from '../../../../models/course.js';
import { selectQuestionById } from '../../../../models/question.js';
import { privateProcedure, selectUsers } from '../../trpc.js';

export const renameQuestion = privateProcedure
  .input(
    z.object({
      // Context.
      course_id: IdSchema,
      user_id: IdSchema,
      authn_user_id: IdSchema,
      has_course_permission_edit: z.boolean(),
      question_id: IdSchema,

      // Question data.
      qid: z.string(),
    }),
  )
  .output(
    z.object({
      status: z.union([z.literal('success'), z.literal('error')]),
      job_sequence_id: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const course = await selectCourseById(opts.input.course_id);
    const question = await selectQuestionById(opts.input.question_id);

    const { user, authn_user } = await selectUsers({
      user_id: opts.input.user_id,
      authn_user_id: opts.input.authn_user_id,
    });

    const editor = new QuestionRenameEditor({
      locals: {
        authz_data: {
          has_course_permission_edit: opts.input.has_course_permission_edit,
          authn_user,
        },
        course,
        user,
        question,
      },
      qid_new: opts.input.qid,
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
