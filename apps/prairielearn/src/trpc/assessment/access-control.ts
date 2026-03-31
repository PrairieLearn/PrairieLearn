import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
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
  computeHash,
  fetchAllAccessControlRules,
} from '../../pages/instructorAssessmentAccess/rules.js';
import {
  type AccessControlJson,
  AccessControlJsonSchema,
  MAX_ACCESS_CONTROL_RULES,
  MAX_ENROLLMENT_RULES,
} from '../../schemas/accessControl.js';
import { validateRule } from '../../sync/fromDisk/accessControl.js';

import {
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  t,
} from './init.js';

export interface AccessControlError {}

const requireEnhancedAccessControl = t.middleware(async (opts) => {
  const enabled = await features.enabled('enhanced-access-control', {
    institution_id: opts.ctx.course.institution_id,
    course_id: opts.ctx.course.id,
    course_instance_id: opts.ctx.course_instance.id,
  });
  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Enhanced access control is not enabled for this course.',
    });
  }
  return opts.next();
});

const students = t.procedure
  .use(requireEnhancedAccessControl)
  .use(requireCourseInstancePermissionView)
  .query(async (opts) => {
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
  .use(requireEnhancedAccessControl)
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

const studentLabels = t.procedure
  .use(requireEnhancedAccessControl)
  .use(requireCourseInstancePermissionView)
  .query(async (opts) => {
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
// duplicate deadline dates before this goes live. Server-side validation
// (validateRule) catches these for all rule types, but the UI should block
// saves proactively so users get immediate feedback instead of a server error.
export const AccessControlJsonInputSchema = AccessControlJsonSchema.extend({
  id: z.string().optional(),
}).strip();

const EnrollmentRuleInputSchema = z.object({
  id: z.string().optional(),
  enrollmentIds: z.array(z.string()),
  ruleJson: AccessControlJsonInputSchema,
});

function isNonEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/**
 * Cleans access control rules for writing to infoAssessment.json on disk.
 * Removes empty objects/arrays and omits listBeforeRelease: false on the main rule.
 */
export function cleanAccessControlRulesForDisk(rules: AccessControlJson[]): object[] {
  return rules.map((rule, index) => {
    const clean: Record<string, unknown> = {};

    if (rule.labels && rule.labels.length > 0) {
      clean.labels = rule.labels;
    }

    if (index === 0 && rule.listBeforeRelease === true) {
      clean.listBeforeRelease = true;
    }

    if (isNonEmptyObject(rule.dateControl)) {
      clean.dateControl = rule.dateControl;
    }

    if (rule.integrations && isNonEmptyObject(rule.integrations)) {
      clean.integrations = rule.integrations;
    }

    if (isNonEmptyObject(rule.afterComplete)) {
      clean.afterComplete = rule.afterComplete;
    }

    return clean;
  });
}

/**
 * Reads infoAssessment.json from disk, merges in the given access control
 * rules, and returns the formatted JSON string ready for FileModifyEditor.
 */
async function buildAccessControlFileContents(
  assessmentPath: string,
  rules: AccessControlJson[],
): Promise<string> {
  const diskContents = await fs.readFile(assessmentPath, 'utf8');
  const assessmentJson = JSON.parse(diskContents);
  assessmentJson.accessControl = cleanAccessControlRulesForDisk(rules);
  return formatJsonWithPrettier(JSON.stringify(assessmentJson));
}

const saveAllRules = t.procedure
  .use(requireEnhancedAccessControl)
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      rules: z.array(AccessControlJsonInputSchema).max(MAX_ACCESS_CONTROL_RULES),
      enrollmentRules: z.array(EnrollmentRuleInputSchema).max(MAX_ENROLLMENT_RULES).optional(),
      origHash: z.string(),
    }),
  )
  .mutation(async (opts) => {
    const { rules, enrollmentRules, origHash } = opts.input;

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

    // Validate all rules before writing anything to disk or DB.
    const rulesToSync: AccessControlJson[] = rules.map(({ id: _id, ...rest }) => rest);
    for (const [index, rule] of rulesToSync.entries()) {
      const targetType = index === 0 ? 'none' : 'student_label';
      const ruleError = validateRule(rule, targetType);
      if (ruleError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: ruleError });
      }
    }

    if (enrollmentRules !== undefined && enrollmentRules.length > 0) {
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
        const ruleError = validateRule(enrollmentRule.ruleJson, 'enrollment');
        if (ruleError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: ruleError });
        }
      }
    }

    // Optimistic concurrency check: verify the full rule set (file + enrollment)
    // hasn't changed since the page was loaded.
    const currentRules = await fetchAllAccessControlRules(opts.ctx.assessment);
    const currentHash = computeHash(currentRules);
    if (currentHash !== origHash) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'The access control rules have been modified since you loaded this page. Please refresh and try again.',
      });
    }

    // Build the updated file contents and write to disk via FileModifyEditor
    // (handles git commit + sync to DB).
    const assessmentDir = path.join(
      opts.ctx.course.path,
      'courseInstances',
      opts.ctx.course_instance.short_name!,
      'assessments',
      opts.ctx.assessment.tid!,
    );
    const assessmentPath = path.join(assessmentDir, 'infoAssessment.json');
    const formattedJson = await buildAccessControlFileContents(assessmentPath, rulesToSync);
    const currentFileHash = (await getOriginalHash(assessmentPath)) ?? '';

    const editor = new FileModifyEditor({
      locals: {
        authz_data: opts.ctx.authz_data,
        course: opts.ctx.course,
        user: opts.ctx.authn_user,
      },
      container: {
        rootPath: assessmentDir,
        invalidRootPaths: [],
      },
      filePath: assessmentPath,
      editContents: b64EncodeUnicode(formattedJson),
      origHash: currentFileHash,
    });

    const serverJob = await editor.prepareServerJob();
    await editor.executeWithServerJob(serverJob);

    // Enrollment rules are written directly to DB (they are per-student
    // overrides, not stored in infoAssessment.json).
    if (enrollmentRules !== undefined) {
      await runInTransactionAsync(async () => {
        await lockAssessment(opts.ctx.assessment);

        // Determine which enrollment rules to delete
        const existingIds = new Set(
          currentRules.filter((r) => r.ruleType === 'enrollment').map((r) => r.id),
        );
        const submittedIds = new Set(enrollmentRules.filter((r) => r.id).map((r) => r.id));
        const idsToDelete = [...existingIds].filter((id) => !submittedIds.has(id));
        await deleteEnrollmentAccessControlsByIds(idsToDelete, opts.ctx.assessment);

        if (enrollmentRules.length > 0) {
          // TODO: Add audit logging for enrollment rule changes. Label/main rules
          // are tracked in git; only enrollment rules need separate audit logs.
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
      });
    }

    const newRules = await fetchAllAccessControlRules(opts.ctx.assessment);
    return { newHash: computeHash(newRules) };
  });

export const accessControlRouter = t.router({
  students,
  validateUids,
  studentLabels,
  saveAllRules,
});
