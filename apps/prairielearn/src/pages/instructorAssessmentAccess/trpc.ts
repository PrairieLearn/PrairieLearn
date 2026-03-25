import crypto from 'node:crypto';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';

import { fetchAllAccessControlRules } from '../../lib/assessment-access-control.js';
import { features } from '../../lib/features/index.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import {
  type EnrollmentAccessControlRuleData,
  deleteEnrollmentAccessControlsByIds,
  syncEnrollmentAccessControl,
} from '../../models/assessment-access-control-rules.js';
import { lockAssessment } from '../../models/assessment.js';
import {
  selectUsersAndEnrollmentsByUidsInCourseInstance,
  selectUsersAndEnrollmentsForCourseInstance,
  validateEnrollmentIdsInCourseInstance,
} from '../../models/enrollment.js';
import { selectStudentLabelsInCourseInstance } from '../../models/student-label.js';
import {
  type AccessControlJson,
  AccessControlJsonSchema,
  MAX_ACCESS_CONTROL_RULES,
} from '../../schemas/accessControl.js';
import { syncAccessControl } from '../../sync/fromDisk/accessControl.js';

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

const students = t.procedure.use(requireCourseInstancePermissionView).query(async (opts) => {
  const rows = await selectUsersAndEnrollmentsForCourseInstance(opts.ctx.course_instance);
  return rows
    .filter((r) => r.enrollment.status === 'joined' && r.user != null)
    .map((r) => ({
      id: r.enrollment.id,
      uid: r.user!.uid,
      name: r.user!.name,
    }));
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

function formJsonToEnrollmentRuleData(
  rule: AccessControlJson & { id?: string },
): EnrollmentAccessControlRuleData {
  const dc = rule.dateControl;
  const ac = rule.afterComplete;
  return {
    id: rule.id,
    listBeforeRelease: rule.listBeforeRelease ?? null,
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

// TODO: Add client-side validation for duplicate PrairieTest exam UUIDs and
// duplicate deadline dates before this goes live. The sync code
// (validateAssessmentRules) catches these server-side, but the UI should block
// saves proactively so users get immediate feedback instead of a sync error.
export const AccessControlJsonInputSchema = AccessControlJsonSchema.extend({
  id: z.string().optional(),
}).strip();

const EnrollmentRuleInputSchema = z.object({
  id: z.string().optional(),
  enrollmentIds: z.array(z.string()),
  ruleJson: AccessControlJsonInputSchema,
});

const saveAllRules = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      rules: z.array(AccessControlJsonInputSchema).max(MAX_ACCESS_CONTROL_RULES),
      enrollmentRules: z.array(EnrollmentRuleInputSchema).optional(),
      origHash: z.string(),
    }),
  )
  .mutation(async (opts) => {
    const { rules, enrollmentRules, origHash } = opts.input;
    const courseInstanceId = opts.ctx.course_instance.id;
    const assessmentId = opts.ctx.assessment.id;

    if (rules.slice(1).some((rule) => rule.listBeforeRelease !== undefined)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'listBeforeRelease can only be specified on the main rule.',
      });
    }

    if (enrollmentRules?.some((rule) => rule.ruleJson.listBeforeRelease !== undefined)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'listBeforeRelease can only be specified on the main rule.',
      });
    }

    return runInTransactionAsync(async () => {
      await lockAssessment(opts.ctx.assessment);
      const currentRules = await fetchAllAccessControlRules(opts.ctx.assessment);
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
        const idsToDelete = [...existingIds].filter((id) => !submittedIds.has(id));
        await deleteEnrollmentAccessControlsByIds(idsToDelete, opts.ctx.assessment);
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

        const allEnrollmentIds = new Set(enrollmentRules.flatMap((r) => r.enrollmentIds));
        if (allEnrollmentIds.size > 0) {
          const validCount = await validateEnrollmentIdsInCourseInstance(
            allEnrollmentIds,
            opts.ctx.course_instance,
          );
          if (validCount !== allEnrollmentIds.size) {
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
            opts.ctx.assessment,
            ruleData,
            enrollmentRule.enrollmentIds,
          );
        }
      }

      // TODO: Add audit logging for enrollment rule changes. Label/main rules
      // are tracked in git; only enrollment rules need separate audit logs.

      const newRules = await fetchAllAccessControlRules(opts.ctx.assessment);
      const newHash = computeHash(newRules);

      return { newHash };
    });
  });

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
