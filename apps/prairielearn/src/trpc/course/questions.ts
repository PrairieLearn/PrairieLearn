import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { QuestionAddEditor } from '../../lib/editors.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionByUuid } from '../../models/question.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

export interface QuestionsError {
  CreateDraft: { code: 'EDITOR_JOB_FAILED'; jobSequenceId: string };
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
    const course = await selectCourseById(opts.ctx.course.id);

    if (course.example_course || !(await fs.pathExists(course.path))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot create questions in this course.',
      });
    }

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

export const questionsRouter = t.router({
  createDraft,
});
