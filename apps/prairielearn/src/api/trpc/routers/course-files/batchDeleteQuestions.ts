import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { QuestionDeleteEditor } from '../../../../lib/editors.js';
import { selectCourseById } from '../../../../models/course.js';
import { selectQuestionsByIdsAndCourseId } from '../../../../models/question.js';
import { privateProcedure, selectUsers } from '../../trpc.js';

export const batchDeleteQuestions = privateProcedure
  .input(
    z.object({
      // Context.
      course_id: IdSchema,
      user_id: IdSchema,
      authn_user_id: IdSchema,
      has_course_permission_edit: z.boolean(),

      // Question data.
      question_ids: z.array(IdSchema),
    }),
  )
  .output(
    z.union([
      z.object({
        status: z.literal('success'),
        job_sequence_id: z.string(),
      }),
      z.object({
        status: z.literal('error'),
        job_sequence_id: z.string(),
      }),
    ]),
  )
  .mutation(async (opts) => {
    const course = await selectCourseById(opts.input.course_id);
    const { user, authn_user } = await selectUsers({
      user_id: opts.input.user_id,
      authn_user_id: opts.input.authn_user_id,
    });

    const questions = await selectQuestionsByIdsAndCourseId({
      question_ids: opts.input.question_ids,
      course_id: opts.input.course_id,
    });

    const editor = new QuestionDeleteEditor({
      locals: {
        authz_data: {
          has_course_permission_edit: opts.input.has_course_permission_edit,
          authn_user,
        },
        course,
        user,
      },
      questions,
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
