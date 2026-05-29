import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { QuestionDeleteEditor } from '../../../../lib/editors.js';
import {
  formatBlockedAssessments,
  selectAssessmentsBlockingDeletion,
} from '../../../../lib/question-deletion-validation.js';
import { type ServerJobExecutor } from '../../../../lib/server-jobs.js';
import { selectCourseById } from '../../../../models/course.js';
import {
  selectQuestionsByIdsAndCourseId,
  selectQuestionsUsedInOtherCourses,
} from '../../../../models/question.js';
import { privateProcedure, selectUsers } from '../../trpc.js';

async function failServerJob(serverJob: ServerJobExecutor, message: string) {
  await serverJob.execute(async (job) => job.fail(message));
}

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

    const blockedByOtherCourses = await selectQuestionsUsedInOtherCourses({
      question_ids: questions.map((question) => question.id),
      course_id: course.id,
    });
    if (blockedByOtherCourses.length > 0) {
      await failServerJob(
        serverJob,
        'One or more questions are used by another course and cannot be deleted. Unshare them or remove them from those assessments first.',
      );
      return {
        status: 'error',
        job_sequence_id: serverJob.jobSequenceId,
      };
    }

    const qidsToRemove = new Set(
      questions.flatMap((question) => (question.qid !== null ? [question.qid] : [])),
    );
    const blockedAssessments = await selectAssessmentsBlockingDeletion({
      course,
      questionIds: questions.map((question) => question.id),
      qidsToRemove,
    });
    if (blockedAssessments.length > 0) {
      await failServerJob(
        serverJob,
        `Deleting these questions would leave the following assessments in an invalid state: ${formatBlockedAssessments(blockedAssessments)}. Remove the questions from these assessments first.`,
      );
      return {
        status: 'error',
        job_sequence_id: serverJob.jobSequenceId,
      };
    }

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
