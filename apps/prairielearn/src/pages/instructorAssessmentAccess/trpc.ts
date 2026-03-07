import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { insertAuditEvent } from '../../models/audit-event.js';
import {
  type EnrollmentAccessControlRuleData,
  deleteEnrollmentAccessControl,
  syncEnrollmentAccessControl,
} from '../../models/enrollment-access-control.js';
import { selectUsersAndEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { selectStudentLabelsInCourseInstance } from '../../models/student-label.js';
import type { AccessControlJson } from '../../schemas/accessControl.js';
import { syncAccessControl } from '../../sync/fromDisk/accessControl.js';

import { AccessControlRuleFormDataSchema, formRuleToJson } from './components/types.js';

const sql = loadSqlEquiv(import.meta.url);

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'assessment'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    assessment: locals.assessment,
    authz_data: locals.authz_data,
    authn_user: locals.authn_user,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const requireCourseInstancePermissionView = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must have student data view permission)',
    });
  }
  return opts.next();
});

const requireCourseInstancePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must have course instance edit permission)',
    });
  }
  return opts.next();
});

const EnrolledStudentSchema = z.object({
  id: z.string(),
  uid: z.string(),
  name: z.string().nullable(),
});

const students = t.procedure.use(requireCourseInstancePermissionView).query(async (opts) => {
  return queryRows(
    sql.select_enrolled_students,
    { course_instance_id: opts.ctx.course_instance.id },
    EnrolledStudentSchema,
  );
});

const validateUids = t.procedure
  .use(requireCourseInstancePermissionView)
  .input(z.object({ uids: z.array(z.string()) }))
  .mutation(async (opts) => {
    const results = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids: opts.input.uids,
      courseInstance: opts.ctx.course_instance,
      requiredRole: ['Student Data Viewer'],
      authzData: opts.ctx.authz_data,
    });

    const enrollmentMap = new Map(results.map((r) => [r.user.uid, r]));

    return opts.input.uids.map((uid) => {
      const match = enrollmentMap.get(uid);
      if (!match) {
        return { id: null, uid, name: null, enrolled: false, notFound: true };
      }
      return {
        id: match.enrollment.id,
        uid: match.user.uid,
        name: match.user.name,
        enrolled: match.enrollment.status === 'joined',
        notFound: false,
      };
    });
  });

const studentLabels = t.procedure.use(requireCourseInstancePermissionView).query(async (opts) => {
  const labels = await selectStudentLabelsInCourseInstance(opts.ctx.course_instance);
  return labels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
  }));
});

const JsonRuleRowSchema = z.object({
  id: z.string(),
  number: z.number(),
  target_type: z.enum(['none', 'student_label']),
  enabled: z.boolean().nullable(),
  block_access: z.boolean().nullable(),
  list_before_release: z.boolean().nullable(),
  date_control_overridden: z.boolean(),
  date_control_release_date_overridden: z.boolean(),
  date_control_release_date: z.coerce.date().nullable(),
  date_control_due_date_overridden: z.boolean(),
  date_control_due_date: z.coerce.date().nullable(),
  date_control_early_deadlines_overridden: z.boolean(),
  date_control_late_deadlines_overridden: z.boolean(),
  date_control_after_last_deadline_allow_submissions: z.boolean().nullable(),
  date_control_after_last_deadline_credit_overridden: z.boolean(),
  date_control_after_last_deadline_credit: z.number().nullable(),
  date_control_duration_minutes_overridden: z.boolean(),
  date_control_duration_minutes: z.number().nullable(),
  date_control_password_overridden: z.boolean(),
  date_control_password: z.string().nullable(),
  integrations_prairietest_overridden: z.boolean(),
  after_complete_hide_questions: z.boolean().nullable(),
  after_complete_show_questions_again_date_overridden: z.boolean(),
  after_complete_show_questions_again_date: z.coerce.date().nullable(),
  after_complete_hide_questions_again_date_overridden: z.boolean(),
  after_complete_hide_questions_again_date: z.coerce.date().nullable(),
  after_complete_hide_score: z.boolean().nullable(),
  after_complete_show_score_again_date_overridden: z.boolean(),
  after_complete_show_score_again_date: z.coerce.date().nullable(),
  labels: z.array(z.string()).nullable(),
  early_deadlines: z.array(z.object({ date: z.string(), credit: z.number() })).nullable(),
  late_deadlines: z.array(z.object({ date: z.string(), credit: z.number() })).nullable(),
  prairietest_exams: z
    .array(z.object({ examUuid: z.string(), readOnly: z.boolean().nullable() }))
    .nullable(),
});

type JsonRuleRow = z.infer<typeof JsonRuleRowSchema>;

/**
 * Reverses the mapField() logic from sync/fromDisk/accessControl.ts:
 * - overridden: false → undefined (inherit)
 * - overridden: true, value: null → null (explicitly overridden to unset)
 * - overridden: true, value: V → V
 */
function unmapField<T>(overridden: boolean, value: T | null): T | null | undefined {
  if (!overridden) return undefined;
  if (value === null) return null;
  return value;
}

function toISOStringOrUndefined(overridden: boolean, date: Date | null): string | undefined {
  if (!overridden || date === null) return undefined;
  return date.toISOString();
}

function dbRowToAccessControlJson(row: JsonRuleRow): AccessControlJson & { id: string } {
  const labels = row.labels ?? [];

  const dateControl: AccessControlJson['dateControl'] = {};

  // Set dateControl.enabled based on whether any date control field is overridden
  if (row.date_control_overridden) {
    dateControl.enabled = true;
  }

  if (row.date_control_release_date_overridden) {
    dateControl.releaseDate = row.date_control_release_date?.toISOString();
  }
  if (row.date_control_due_date_overridden) {
    dateControl.dueDate = row.date_control_due_date?.toISOString() ?? null;
  }
  if (row.date_control_early_deadlines_overridden) {
    dateControl.earlyDeadlines = row.early_deadlines ?? [];
  }
  if (row.date_control_late_deadlines_overridden) {
    dateControl.lateDeadlines = row.late_deadlines ?? [];
  }
  if (
    row.date_control_after_last_deadline_credit_overridden ||
    row.date_control_after_last_deadline_allow_submissions !== null
  ) {
    dateControl.afterLastDeadline = {
      credit:
        unmapField(
          row.date_control_after_last_deadline_credit_overridden,
          row.date_control_after_last_deadline_credit,
        ) ?? undefined,
      allowSubmissions: row.date_control_after_last_deadline_allow_submissions ?? undefined,
    };
  }
  if (row.date_control_duration_minutes_overridden) {
    dateControl.durationMinutes = row.date_control_duration_minutes ?? undefined;
  }
  if (row.date_control_password_overridden) {
    dateControl.password = row.date_control_password;
  }

  const integrations: AccessControlJson['integrations'] = {};
  if (row.integrations_prairietest_overridden && row.prairietest_exams) {
    integrations.prairieTest = {
      enabled: true,
      exams: row.prairietest_exams.map((e) => ({
        examUuid: e.examUuid,
        readOnly: e.readOnly ?? undefined,
      })),
    };
  }

  const afterComplete: AccessControlJson['afterComplete'] = {};
  if (row.after_complete_hide_questions !== null) {
    afterComplete.hideQuestions = row.after_complete_hide_questions;
  }
  if (row.after_complete_show_questions_again_date_overridden) {
    afterComplete.showQuestionsAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_show_questions_again_date,
    );
  }
  if (row.after_complete_hide_questions_again_date_overridden) {
    afterComplete.hideQuestionsAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_hide_questions_again_date,
    );
  }
  if (row.after_complete_hide_score !== null) {
    afterComplete.hideScore = row.after_complete_hide_score;
  }
  if (row.after_complete_show_score_again_date_overridden) {
    afterComplete.showScoreAgainDate = toISOStringOrUndefined(
      true,
      row.after_complete_show_score_again_date,
    );
  }

  return {
    id: row.id,
    enabled: row.enabled ?? undefined,
    blockAccess: row.block_access,
    listBeforeRelease: row.list_before_release,
    labels: labels.length > 0 ? labels : undefined,
    dateControl: Object.keys(dateControl).length > 0 ? dateControl : undefined,
    integrations: Object.keys(integrations).length > 0 ? integrations : undefined,
    afterComplete: Object.keys(afterComplete).length > 0 ? afterComplete : undefined,
  };
}

function formRuleToEnrollmentData(
  rule: z.infer<typeof AccessControlRuleFormDataSchema>,
): EnrollmentAccessControlRuleData {
  const dc = rule.dateControl;
  const ac = rule.afterComplete;

  const releaseDateOverridden = dc.releaseDate.isOverridden && dc.releaseDate.isEnabled;
  const dueDateOverridden = dc.dueDate.isOverridden && dc.dueDate.isEnabled;
  const earlyDeadlinesOverridden =
    dc.earlyDeadlines.isOverridden &&
    dc.earlyDeadlines.isEnabled &&
    dc.earlyDeadlines.value.length > 0;
  const lateDeadlinesOverridden =
    dc.lateDeadlines.isOverridden &&
    dc.lateDeadlines.isEnabled &&
    dc.lateDeadlines.value.length > 0;
  const afterLastDeadlineCreditOverridden =
    dc.afterLastDeadline.isOverridden && dc.afterLastDeadline.isEnabled;
  const durationMinutesOverridden = dc.durationMinutes.isOverridden && dc.durationMinutes.isEnabled;
  const passwordOverridden =
    dc.password.isOverridden && dc.password.isEnabled && dc.password.value !== '';

  const dateControlOverridden =
    releaseDateOverridden ||
    dueDateOverridden ||
    earlyDeadlinesOverridden ||
    lateDeadlinesOverridden ||
    afterLastDeadlineCreditOverridden ||
    durationMinutesOverridden ||
    passwordOverridden;

  return {
    id: rule.id,
    enabled: rule.enabled,
    blockAccess: rule.blockAccess ?? false,
    listBeforeRelease: rule.listBeforeRelease ?? true,
    dateControlOverridden,
    releaseDateOverridden,
    releaseDate: releaseDateOverridden && dc.releaseDate.value ? dc.releaseDate.value : null,
    dueDateOverridden,
    dueDate: dueDateOverridden && dc.dueDate.value ? dc.dueDate.value : null,
    earlyDeadlinesOverridden,
    lateDeadlinesOverridden,
    afterLastDeadlineAllowSubmissions: afterLastDeadlineCreditOverridden
      ? (dc.afterLastDeadline.value.allowSubmissions ?? null)
      : null,
    afterLastDeadlineCreditOverridden,
    afterLastDeadlineCredit: afterLastDeadlineCreditOverridden
      ? (dc.afterLastDeadline.value.credit ?? null)
      : null,
    durationMinutesOverridden,
    durationMinutes: durationMinutesOverridden ? dc.durationMinutes.value : null,
    passwordOverridden,
    password: passwordOverridden ? dc.password.value : null,
    integrationsPrairietestOverridden: false,
    hideQuestions: ac.questionVisibility.isOverridden
      ? ac.questionVisibility.value.hideQuestions
      : null,
    showQuestionsAgainDateOverridden:
      ac.questionVisibility.isOverridden && ac.questionVisibility.value.showAgainDate !== undefined,
    showQuestionsAgainDate: ac.questionVisibility.isOverridden
      ? (ac.questionVisibility.value.showAgainDate ?? null)
      : null,
    hideQuestionsAgainDateOverridden:
      ac.questionVisibility.isOverridden && ac.questionVisibility.value.hideAgainDate !== undefined,
    hideQuestionsAgainDate: ac.questionVisibility.isOverridden
      ? (ac.questionVisibility.value.hideAgainDate ?? null)
      : null,
    hideScore: ac.scoreVisibility.isOverridden ? ac.scoreVisibility.value.hideScore : null,
    showScoreAgainDateOverridden:
      ac.scoreVisibility.isOverridden && ac.scoreVisibility.value.showAgainDate !== undefined,
    showScoreAgainDate: ac.scoreVisibility.isOverridden
      ? (ac.scoreVisibility.value.showAgainDate ?? null)
      : null,
    earlyDeadlines: earlyDeadlinesOverridden ? dc.earlyDeadlines.value : [],
    lateDeadlines: lateDeadlinesOverridden ? dc.lateDeadlines.value : [],
  };
}

const saveRule = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      isMainRule: z.boolean(),
      isNew: z.boolean(),
      ruleId: z.string().optional(),
      formData: AccessControlRuleFormDataSchema,
    }),
  )
  .mutation(async (opts) => {
    const { isMainRule, isNew, ruleId, formData } = opts.input;
    const courseInstanceId = opts.ctx.course_instance.id;
    const assessmentId = opts.ctx.assessment.id;

    if (formData.appliesTo.targetType === 'individual' && !isMainRule) {
      // Enrollment path
      const ruleData = formRuleToEnrollmentData(formData);
      if (!isNew && ruleId) {
        ruleData.id = ruleId;
      }
      const enrollmentIds = formData.appliesTo.individuals
        .map((i) => i.enrollmentId)
        .filter((id): id is string => id !== undefined);

      const newRuleId = await syncEnrollmentAccessControl(
        courseInstanceId,
        assessmentId,
        ruleData,
        enrollmentIds,
      );

      await insertAuditEvent({
        tableName: 'assessment_access_control',
        action: isNew ? 'insert' : 'update',
        actionDetail: 'rule_saved',
        rowId: newRuleId,
        newRow: { target_type: 'enrollment', enrollment_ids: enrollmentIds },
        assessmentId,
        courseInstanceId,
        agentUserId: opts.ctx.authz_data.user.id,
        agentAuthnUserId: opts.ctx.authn_user.id,
      });
    } else {
      // JSON path (main rule or student_label override)
      // Wrap in a transaction to prevent race conditions between read and write
      await runInTransactionAsync(async () => {
        const existingRows = await queryRows(
          sql.select_all_json_rules,
          { assessment_id: assessmentId },
          JsonRuleRowSchema,
        );

        const existingJsonRules = existingRows.map(dbRowToAccessControlJson);
        const newRuleJson = formRuleToJson(formData, isMainRule);

        let updatedRules: (AccessControlJson & { id?: string })[];

        if (isNew) {
          if (isMainRule) {
            // Replace or insert at index 0
            updatedRules = [newRuleJson, ...existingJsonRules];
          } else {
            updatedRules = [...existingJsonRules, newRuleJson];
          }
        } else {
          // Find and replace the matching rule by ruleId
          const idx = existingJsonRules.findIndex((r) => r.id === ruleId);
          if (idx === -1) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Access control rule ${ruleId} not found`,
            });
          }
          updatedRules = [...existingJsonRules];
          updatedRules[idx] = newRuleJson;
        }

        // Strip the `id` property before passing to syncAccessControl
        const rulesToSync: AccessControlJson[] = updatedRules.map(({ id: _id, ...rest }) => rest);

        await syncAccessControl(courseInstanceId, assessmentId, rulesToSync);

        await insertAuditEvent({
          tableName: 'assessment_access_control',
          action: isNew ? 'insert' : 'update',
          actionDetail: 'rule_saved',
          rowId: ruleId ?? assessmentId,
          newRow: { is_main_rule: isMainRule, rule_count: rulesToSync.length },
          assessmentId,
          courseInstanceId,
          agentUserId: opts.ctx.authz_data.user.id,
          agentAuthnUserId: opts.ctx.authn_user.id,
        });
      });
    }

    return { success: true as const };
  });

const deleteRule = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      ruleId: z.string(),
      targetType: z.enum(['enrollment', 'student_label', 'none']),
    }),
  )
  .mutation(async (opts) => {
    const { ruleId, targetType } = opts.input;
    const courseInstanceId = opts.ctx.course_instance.id;
    const assessmentId = opts.ctx.assessment.id;

    if (targetType === 'none') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot delete the main access control rule',
      });
    }

    if (targetType === 'enrollment') {
      await deleteEnrollmentAccessControl(ruleId, courseInstanceId, assessmentId);
    } else {
      // student_label: load all JSON rules, remove the matching one, re-sync
      // Wrap in a transaction to prevent race conditions between read and write
      await runInTransactionAsync(async () => {
        const existingRows = await queryRows(
          sql.select_all_json_rules,
          { assessment_id: assessmentId },
          JsonRuleRowSchema,
        );

        const existingJsonRules = existingRows.map(dbRowToAccessControlJson);
        const filtered = existingJsonRules.filter((r) => r.id !== ruleId);

        if (filtered.length === existingJsonRules.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Access control rule ${ruleId} not found`,
          });
        }

        const rulesToSync: AccessControlJson[] = filtered.map(({ id: _id, ...rest }) => rest);
        await syncAccessControl(courseInstanceId, assessmentId, rulesToSync);
      });
    }

    await insertAuditEvent({
      tableName: 'assessment_access_control',
      action: 'delete',
      actionDetail: 'rule_deleted',
      rowId: ruleId,
      oldRow: { target_type: targetType },
      assessmentId,
      courseInstanceId,
      agentUserId: opts.ctx.authz_data.user.id,
      agentAuthnUserId: opts.ctx.authn_user.id,
    });

    return { success: true as const };
  });

export const accessControlRouter = t.router({
  students,
  validateUids,
  studentLabels,
  saveRule,
  deleteRule,
});

export type AccessControlRouter = typeof accessControlRouter;
