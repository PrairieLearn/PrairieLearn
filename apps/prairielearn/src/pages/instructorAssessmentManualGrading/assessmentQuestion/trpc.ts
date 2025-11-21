import path from 'node:path';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

// TODO: these transitively drag a ton of types into the graph of code that ends
// up being type-checked in the client bundle, which fails because the client
// assets have strict mode enabled but the reset of the server code does not.
import { fillInstanceQuestionColumnEntries } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  deleteAiGradingJobs,
  setAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { deleteAiInstanceQuestionGroups } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import type { Course } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import {
  InstanceQuestionRowSchema,
  InstanceQuestionRowWithAIGradingStatsSchema,
} from './assessmentQuestion.types.js';

const sql = loadSqlEquiv(path.join(import.meta.dirname, 'assessmentQuestion.js'));

export function createContext({ res }: CreateExpressContextOptions) {
  const pageContext = extractPageContext(res.locals, {
    pageType: 'assessmentQuestion',
    accessType: 'instructor',
  });

  return {
    user: pageContext.authz_data.user,
    authn_user: pageContext.authz_data.authn_user,
    course: pageContext.course,
    course_instance: pageContext.course_instance,
    assessment: pageContext.assessment,
    question: pageContext.question,
    assessment_question: pageContext.assessment_question,
    locals: res.locals,
    pageContext,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const instancesQuery = t.procedure
  .output(z.array(InstanceQuestionRowWithAIGradingStatsSchema))
  .query(async (opts) => {
    if (!opts.ctx.pageContext.authz_data.has_course_instance_permission_view) {
      throw new TRPCError({
        message: 'Access denied (must be a student data viewer)',
        code: 'FORBIDDEN',
      });
    }

    const instance_questions = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: opts.ctx.assessment.id,
        assessment_question_id: opts.ctx.assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );

    return await fillInstanceQuestionColumnEntries(
      instance_questions,
      opts.ctx.assessment_question,
    );
  });

const setAiGradingModeMutation = t.procedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    await setAiGradingMode(opts.ctx.assessment_question.id, opts.input.enabled);
  });

const deleteAiGradingJobsMutation = t.procedure
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    const iqs = await deleteAiGradingJobs({
      assessment_question_ids: [opts.ctx.assessment_question.id],
      authn_user_id: opts.ctx.authn_user.user_id,
    });

    return { num_deleted: iqs.length };
  });

const deleteAiInstanceQuestionGroupingsMutation = t.procedure
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    const num_deleted = await deleteAiInstanceQuestionGroups({
      assessment_question_id: opts.ctx.assessment_question.id,
    });

    return { num_deleted };
  });

const aiGroupInstanceQuestionsMutation = t.procedure
  .input(
    z.object({
      selection: z.union([z.literal('all'), z.literal('ungrouped'), z.string().array()]),
      closed_instance_questions_only: z.boolean(),
    }),
  )
  .output(z.object({ job_sequence_id: z.string() }))
  .mutation(async (opts) => {
    const job_sequence_id = await aiInstanceQuestionGrouping({
      question: opts.ctx.question,
      // TODO: what to do about this?
      course: opts.ctx.course as unknown as Course,
      course_instance_id: opts.ctx.course_instance.id,
      assessment_question: opts.ctx.assessment_question,
      urlPrefix: '...',
      authn_user_id: opts.ctx.authn_user.user_id,
      user_id: opts.ctx.user.user_id,
      closed_instance_questions_only: opts.input.closed_instance_questions_only,
      ungrouped_instance_questions_only: opts.input.selection === 'ungrouped',
      instance_question_ids: run(() => {
        if (!Array.isArray(opts.input.selection)) return undefined;
        return opts.input.selection;
      }),
    });
    return { job_sequence_id };
  });

const aiGradeInstanceQuestionMutation = t.procedure
  .input(
    z.object({
      selection: z.union([z.literal('all'), z.literal('human_graded'), z.string().array()]),
    }),
  )
  .output(z.object({ job_sequence_id: z.string() }))
  .mutation(async (opts) => {
    const job_sequence_id = await aiGrade({
      question: opts.ctx.question,
      // TODO: what to do about this?
      course: opts.ctx.course as unknown as Course,
      course_instance: opts.ctx.course_instance,
      assessment: opts.ctx.assessment,
      assessment_question: opts.ctx.assessment_question,
      urlPrefix: opts.ctx.pageContext.urlPrefix,
      authn_user_id: opts.ctx.authn_user.user_id,
      user_id: opts.ctx.user.user_id,
      mode: run(() => {
        if (Array.isArray(opts.input.selection)) return 'selected';
        return opts.input.selection;
      }),
      instance_question_ids: run(() => {
        if (!Array.isArray(opts.input.selection)) return undefined;
        return opts.input.selection;
      }),
    });
    return { job_sequence_id };
  });

const setAssignedGraderMutation = t.procedure
  .input(
    z.object({ assigned_grader: z.string().nullable(), instance_question_ids: z.string().array() }),
  )
  .mutation(async (opts) => {
    const assigned_grader = opts.input.assigned_grader;
    if (assigned_grader !== null) {
      const courseStaff = await selectCourseInstanceGraderStaff({
        course_instance: opts.ctx.course_instance,
      });
      if (!courseStaff.some((staff) => idsEqual(staff.user_id, assigned_grader))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assigned grader does not have Student Data Editor permission',
        });
      }
    }

    await execute(sql.update_instance_questions, {
      assessment_question_id: opts.ctx.assessment_question.id,
      instance_question_ids: opts.input.instance_question_ids,
      update_requires_manual_grading: false,
      requires_manual_grading: null,
      update_assigned_grader: true,
      assigned_grader,
    });
  });

const setRequiresManualGradingMutation = t.procedure
  .input(
    z.object({
      requires_manual_grading: z.boolean(),
      instance_question_ids: z.string().array(),
    }),
  )
  .mutation(async (opts) => {
    await execute(sql.update_instance_questions, {
      assessment_question_id: opts.ctx.assessment_question.id,
      instance_question_ids: opts.input.instance_question_ids,
      update_requires_manual_grading: true,
      requires_manual_grading: opts.input.requires_manual_grading,
      update_assigned_grader: false,
      assigned_grader: null,
    });
  });

export const manualGradingAssessmentQuestionRouter = t.router({
  instances: instancesQuery,
  setAiGradingMode: setAiGradingModeMutation,
  deleteAiGradingJobs: deleteAiGradingJobsMutation,
  deleteAiInstanceQuestionGroupings: deleteAiInstanceQuestionGroupingsMutation,
  aiGroupInstanceQuestions: aiGroupInstanceQuestionsMutation,
  aiGradeInstanceQuestions: aiGradeInstanceQuestionMutation,
  setAssignedGrader: setAssignedGraderMutation,
  setRequiresManualGrading: setRequiresManualGradingMutation,
});

export type ManualGradingAssessmentQuestionRouter = typeof manualGradingAssessmentQuestionRouter;
