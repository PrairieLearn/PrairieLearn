import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { QuestionAddEditor } from '../../lib/editors.js';
import {
  DraftFinalizationEditorJobError,
  DraftFinalizationInputError,
  finalizeDraftQuestion,
} from '../../lib/question-drafts.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById, selectQuestionByUuid } from '../../models/question.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

export interface QuestionsError {
  CreateDraft: { code: 'EDITOR_JOB_FAILED'; jobSequenceId: string };
  FinalizeDraft: { code: 'EDITOR_JOB_FAILED'; jobSequenceId: string };
}

async function assertCanMutateQuestions(courseId: string) {
  const course = await selectCourseById(courseId);

  if (course.example_course || !(await fs.pathExists(course.path))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot create questions in this course.',
    });
  }

  return course;
}

const createDraft = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      startFrom: z.enum(['empty', 'example', 'course']),
      templateQid: z.string().optional(),
    }),
  )
  .mutation(async (opts) => {
    const { locals } = opts.ctx;
    const course = await assertCanMutateQuestions(opts.ctx.course.id);

    const usesTemplate = opts.input.startFrom !== 'empty';
    if (usesTemplate && !opts.input.templateQid) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'templateQid is required.' });
    }
    if (!usesTemplate && opts.input.templateQid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'templateQid cannot be supplied for an empty question.',
      });
    }

    const editor = new QuestionAddEditor({
      locals: {
        authz_data: {
          has_course_permission_edit: opts.ctx.authz_data.has_course_permission_edit,
          authn_user: locals.authn_user,
        },
        course,
        user: locals.user,
      },
      template_source: opts.input.startFrom,
      template_qid: usesTemplate ? opts.input.templateQid : undefined,
      isDraft: true,
    });

    const serverJob = await editor.prepareServerJob();

    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<QuestionsError['CreateDraft']>({
        code: 'EDITOR_JOB_FAILED',
        message: 'Failed to create the draft question.',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    const question = await selectQuestionByUuid({
      course_id: course.id,
      uuid: editor.uuid,
    });

    await execute(sql.insert_draft_question_metadata, {
      question_id: question.id,
      creator_id: locals.authn_user.id,
    });

    return {
      questionId: question.id,
      editorUrl: `${locals.urlPrefix}/question/${question.id}/draft`,
    };
  });

const finalizeDraft = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      questionId: IdSchema,
      qid: z.string().trim().min(1),
      title: z.string().trim().min(1),
    }),
  )
  .mutation(async (opts) => {
    const { locals } = opts.ctx;
    const course = await assertCanMutateQuestions(opts.ctx.course.id);
    const question = await selectQuestionById(opts.input.questionId);

    try {
      await finalizeDraftQuestion({
        course,
        question,
        user: locals.user,
        authnUser: locals.authn_user,
        hasCoursePermissionEdit: opts.ctx.authz_data.has_course_permission_edit,
        qid: opts.input.qid,
        title: opts.input.title,
      });
    } catch (err) {
      if (err instanceof DraftFinalizationInputError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      if (!(err instanceof DraftFinalizationEditorJobError)) throw err;
      throwAppError<QuestionsError['FinalizeDraft']>({
        code: 'EDITOR_JOB_FAILED',
        message: 'Failed to finalize the draft question.',
        jobSequenceId: err.jobSequenceId,
      });
    }

    return {
      questionId: question.id,
      previewUrl: `${locals.urlPrefix}/question/${question.id}/preview`,
    };
  });

export const questionsRouter = t.router({
  createDraft,
  finalizeDraft,
});
