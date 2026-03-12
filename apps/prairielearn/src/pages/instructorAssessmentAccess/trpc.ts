import crypto from 'node:crypto';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import {
  loadSqlEquiv,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { AssessmentAccessControlSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
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

import type { AccessControlJsonWithId as SharedAccessControlJsonWithId } from './components/types.js';

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
  .query(async (opts) => {
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

const AccessControlRuleBaseSchema = AssessmentAccessControlSchema.omit({
  assessment_id: true,
  course_instance_id: true,
});

const DeadlineArraySchema = z.array(z.object({ date: z.string(), credit: z.number() })).nullable();

const JsonRuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.enum(['none', 'student_label']),
  labels: z.array(z.string()).nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
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

type BaseRuleRow = z.infer<typeof AccessControlRuleBaseSchema> & {
  early_deadlines: z.infer<typeof DeadlineArraySchema>;
  late_deadlines: z.infer<typeof DeadlineArraySchema>;
};

function dbBaseRowToAccessControlJson(row: BaseRuleRow): AccessControlJson & { id: string } {
  const dateControl: AccessControlJson['dateControl'] = {};

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
    dateControl: Object.keys(dateControl).length > 0 ? dateControl : undefined,
    afterComplete: Object.keys(afterComplete).length > 0 ? afterComplete : undefined,
  };
}

function dbRowToAccessControlJson(row: JsonRuleRow): AccessControlJson & { id: string } {
  const base = dbBaseRowToAccessControlJson(row);
  const labels = row.labels ?? [];

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

  return {
    ...base,
    labels: labels.length > 0 ? labels : undefined,
    integrations: Object.keys(integrations).length > 0 ? integrations : undefined,
  };
}

type AccessControlJsonWithId = Required<Pick<SharedAccessControlJsonWithId, 'id'>> &
  SharedAccessControlJsonWithId;

const EnrollmentRuleRowSchema = AccessControlRuleBaseSchema.extend({
  target_type: z.literal('enrollment'),
  enrollments: z
    .array(
      z.object({
        enrollmentId: z.string(),
        uid: z.string(),
        name: z.string().nullable(),
      }),
    )
    .nullable(),
  early_deadlines: DeadlineArraySchema,
  late_deadlines: DeadlineArraySchema,
});

type EnrollmentRuleRow = z.infer<typeof EnrollmentRuleRowSchema>;

function dbEnrollmentRowToAccessControlJson(row: EnrollmentRuleRow): AccessControlJsonWithId {
  const base = dbBaseRowToAccessControlJson(row);
  return {
    ...base,
    ruleType: 'enrollment',
    individuals: row.enrollments ?? [],
  };
}

async function fetchEnrollmentRules(assessmentId: string): Promise<AccessControlJsonWithId[]> {
  const rows = await queryRows(
    sql.select_all_enrollment_rules,
    { assessment_id: assessmentId },
    EnrollmentRuleRowSchema,
  );
  return rows.map(dbEnrollmentRowToAccessControlJson);
}

export async function fetchAllAccessControlRules(
  assessmentId: string,
): Promise<AccessControlJsonWithId[]> {
  const [jsonRules, enrollmentRules] = await Promise.all([
    fetchAccessControlJsonRules(assessmentId),
    fetchEnrollmentRules(assessmentId),
  ]);
  return [...jsonRules, ...enrollmentRules];
}

function formJsonToEnrollmentRuleData(
  rule: AccessControlJson & { id?: string },
): EnrollmentAccessControlRuleData {
  const dc = rule.dateControl;
  const ac = rule.afterComplete;
  return {
    id: rule.id,
    enabled: rule.enabled ?? true,
    blockAccess: rule.blockAccess ?? false,
    listBeforeRelease: rule.listBeforeRelease ?? true,
    dateControlOverridden: dc?.enabled === true,
    releaseDateOverridden: dc?.releaseDate !== undefined,
    releaseDate: dc?.releaseDate ?? null,
    dueDateOverridden: dc?.dueDate !== undefined,
    dueDate: dc?.dueDate ?? null,
    earlyDeadlinesOverridden: dc?.earlyDeadlines !== undefined,
    lateDeadlinesOverridden: dc?.lateDeadlines !== undefined,
    afterLastDeadlineAllowSubmissions: dc?.afterLastDeadline?.allowSubmissions ?? null,
    afterLastDeadlineCreditOverridden: dc?.afterLastDeadline?.credit !== undefined,
    afterLastDeadlineCredit: dc?.afterLastDeadline?.credit ?? null,
    durationMinutesOverridden: dc?.durationMinutes !== undefined,
    durationMinutes: dc?.durationMinutes ?? null,
    passwordOverridden: dc?.password !== undefined,
    password: dc?.password ?? null,
    // PrairieTest integrations are only configured on the main rule, not on enrollment overrides.
    integrationsPrairietestOverridden: false,
    hideQuestions: ac?.hideQuestions ?? null,
    showQuestionsAgainDateOverridden: ac?.showQuestionsAgainDate !== undefined,
    showQuestionsAgainDate: ac?.showQuestionsAgainDate ?? null,
    hideQuestionsAgainDateOverridden: ac?.hideQuestionsAgainDate !== undefined,
    hideQuestionsAgainDate: ac?.hideQuestionsAgainDate ?? null,
    hideScore: ac?.hideScore ?? null,
    showScoreAgainDateOverridden: ac?.showScoreAgainDate !== undefined,
    showScoreAgainDate: ac?.showScoreAgainDate ?? null,
    earlyDeadlines: dc?.earlyDeadlines ?? [],
    lateDeadlines: dc?.lateDeadlines ?? [],
  };
}

const DateStringInputSchema = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
  message: 'Must be a valid date string',
});

const DeadlineInputSchema = z.object({
  date: DateStringInputSchema,
  credit: z.number().min(0, 'Credit must be non-negative'),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AccessControlJsonInputSchema: z.ZodType<AccessControlJson & { id?: string }> = z.object({
  id: z.string().optional(),
  enabled: z.boolean().optional(),
  blockAccess: z.boolean().nullable().optional(),
  listBeforeRelease: z.boolean().nullable().optional(),
  labels: z.array(z.string()).optional(),
  dateControl: z
    .object({
      enabled: z.boolean().optional(),
      releaseDate: DateStringInputSchema.optional(),
      dueDate: DateStringInputSchema.nullable().optional(),
      earlyDeadlines: z.array(DeadlineInputSchema).optional(),
      lateDeadlines: z.array(DeadlineInputSchema).optional(),
      afterLastDeadline: z
        .object({
          credit: z.number().min(0, 'Credit must be non-negative').optional(),
          allowSubmissions: z.boolean().optional(),
        })
        .optional(),
      durationMinutes: z.number().int().positive().optional(),
      password: z.string().nullable().optional(),
    })
    .optional(),
  integrations: z
    .object({
      prairieTest: z
        .object({
          enabled: z.boolean().optional(),
          exams: z
            .array(
              z.object({
                examUuid: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
                readOnly: z.boolean().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  afterComplete: z
    .object({
      hideQuestions: z.boolean().optional(),
      showQuestionsAgainDate: DateStringInputSchema.optional(),
      hideQuestionsAgainDate: DateStringInputSchema.optional(),
      hideScore: z.boolean().optional(),
      showScoreAgainDate: DateStringInputSchema.optional(),
    })
    .optional(),
});

const EnrollmentRuleInputSchema = z.object({
  id: z.string().optional(),
  enrollmentIds: z.array(z.string()),
  ruleJson: AccessControlJsonInputSchema,
});

const saveAllRules = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      rules: z.array(AccessControlJsonInputSchema),
      enrollmentRules: z.array(EnrollmentRuleInputSchema).optional(),
      origHash: z.string(),
    }),
  )
  .mutation(async (opts) => {
    const { rules, enrollmentRules, origHash } = opts.input;
    const courseInstanceId = opts.ctx.course_instance.id;
    const assessmentId = opts.ctx.assessment.id;

    return runInTransactionAsync(async () => {
      const currentRules = await fetchAllAccessControlRules(assessmentId);
      const currentHash = computeHash(currentRules);

      if (currentHash !== origHash) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The access control rules have been modified since you loaded this page. Please refresh and try again.',
        });
      }

      const rulesToSync: AccessControlJson[] = rules.map(({ id: _id, ...rest }) => rest);
      await syncAccessControl(courseInstanceId, assessmentId, rulesToSync);

      // Only process enrollment rule deletions when enrollmentRules is explicitly
      // provided. When omitted, leave existing enrollment rules untouched.
      if (enrollmentRules !== undefined) {
        const existingIds = new Set(
          currentRules.filter((r) => r.ruleType === 'enrollment').map((r) => r.id),
        );
        const submittedIds = new Set(enrollmentRules.filter((r) => r.id).map((r) => r.id));

        for (const existingId of existingIds) {
          if (!submittedIds.has(existingId)) {
            await deleteEnrollmentAccessControl(existingId, courseInstanceId, assessmentId);
          }
        }
      }

      if (enrollmentRules !== undefined && enrollmentRules.length > 0) {
        const enhancedEnabled = await features.enabled('enhanced-access-control', {
          institution_id: opts.ctx.course.institution_id,
          course_id: opts.ctx.course.id,
          course_instance_id: opts.ctx.course_instance.id,
        });
        if (!enhancedEnabled) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Enhanced access control is not enabled for this course.',
          });
        }

        const allEnrollmentIds = [...new Set(enrollmentRules.flatMap((r) => r.enrollmentIds))];
        if (allEnrollmentIds.length > 0) {
          const validCount = await queryScalar(
            sql.validate_enrollment_ids,
            { enrollment_ids: allEnrollmentIds, course_instance_id: courseInstanceId },
            z.number(),
          );
          if (validCount !== allEnrollmentIds.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'One or more enrollment IDs do not belong to this course instance.',
            });
          }
        }

        for (const enrollmentRule of enrollmentRules) {
          const ruleData = formJsonToEnrollmentRuleData(enrollmentRule.ruleJson);
          if (enrollmentRule.id) {
            ruleData.id = enrollmentRule.id;
          }
          await syncEnrollmentAccessControl(
            courseInstanceId,
            assessmentId,
            ruleData,
            enrollmentRule.enrollmentIds,
          );
        }
      }

      await insertAuditEvent({
        tableName: 'assessment_access_control',
        action: 'update',
        actionDetail: 'rule_saved',
        rowId: assessmentId,
        oldRow: { rules: currentRules },
        newRow: { rule_count: rulesToSync.length + (enrollmentRules?.length ?? 0) },
        assessmentId,
        courseInstanceId,
        agentUserId: opts.ctx.authz_data.user.id,
        agentAuthnUserId: opts.ctx.authn_user.id,
      });

      const newRules = await fetchAllAccessControlRules(assessmentId);
      const newHash = computeHash(newRules);

      return { newHash };
    });
  });

async function fetchAccessControlJsonRules(assessmentId: string) {
  const rows = await queryRows(
    sql.select_all_json_rules,
    { assessment_id: assessmentId },
    JsonRuleRowSchema,
  );
  return rows.map(dbRowToAccessControlJson);
}

export function computeHash(rules: object[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(rules)).digest('hex');
}

export const accessControlRouter = t.router({
  students,
  validateUids,
  studentLabels,
  saveAllRules,
});

export type AccessControlRouter = typeof accessControlRouter;
