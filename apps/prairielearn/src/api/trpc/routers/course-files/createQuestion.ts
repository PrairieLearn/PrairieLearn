import { z } from 'zod';

import { IdSchema } from '../../../../lib/db-types.js';
import { QuestionAddEditor, QuestionAddFromTemplateEditor } from '../../../../lib/editors.js';
import { selectCourseById } from '../../../../models/course.js';
import { selectQuestionByUuid } from '../../../../models/question.js';
import { privateProcedure, selectUsers } from '../../trpc.js';

export const createQuestion = privateProcedure
  .input(
    z.object({
      // Context.
      course_id: IdSchema,
      user_id: IdSchema,
      authn_user_id: IdSchema,
      has_course_permission_edit: z.boolean(),

      // Question data.
      qid: z.string().optional(),
      title: z.string().optional(),
      files: z.record(z.string()).optional(),
      is_draft: z.boolean().optional(),

      // Optional: a template question qid to copy from.
      template_qid: z.string().optional(),
    }),
  )
  .output(
    z.union([
      z.object({
        status: z.literal('success'),
        job_sequence_id: z.string(),
        question_id: z.string(),
        question_qid: z.string(),
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

    let editor: QuestionAddFromTemplateEditor | QuestionAddEditor;
    if (opts.input.template_qid && opts.input.qid && opts.input.title) {
      editor = new QuestionAddFromTemplateEditor({
        locals: {
          authz_data: {
            has_course_permission_edit: opts.input.has_course_permission_edit,
            authn_user,
          },
          course,
          user,
        },
        qid: opts.input.qid,
        title: opts.input.title,
        template_qid: opts.input.template_qid,
      });
    } else {
      editor = new QuestionAddEditor({
        locals: {
          authz_data: {
            has_course_permission_edit: opts.input.has_course_permission_edit,
            authn_user,
          },
          course,
          user,
        },
        files: opts.input.files,
        qid: opts.input.qid,
        title: opts.input.title,
        isDraft: opts.input.is_draft,
      });
    }

    const serverJob = await editor.prepareServerJob();

    try {
      await editor.executeWithServerJob(serverJob);
    } catch (e) {
      console.error(e);
      return {
        status: 'error',
        job_sequence_id: serverJob.jobSequenceId,
      };
    }

    const question = await selectQuestionByUuid({
      course_id: course.id,
      uuid: editor.uuid,
    });

    if (question.qid) {
      return {
        status: 'success',
        job_sequence_id: serverJob.jobSequenceId,
        question_id: question.id,
        question_qid: question.qid,
      };
    } else {
      return {
        status: 'error',
        job_sequence_id: serverJob.jobSequenceId,
      };
    }
  });
