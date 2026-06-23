import * as path from 'path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { validateAccessControlRules } from '../../lib/assessment-access-control/validation.js';
import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { saveJsonFile } from '../../lib/editors.js';
import {
  type AccessControlJsonWithId,
  type EnrollmentAccessControlRuleData,
  replaceEnrollmentAccessControlRules,
  selectAccessControlRules,
  selectPrairieTestExamMetadataByUuids,
} from '../../models/assessment-access-control-rules.js';
import {
  selectUsersAndEnrollmentsForCourseInstance,
  validateEnrollmentIdsInCourseInstance,
} from '../../models/enrollment.js';
import { selectStudentLabelsInCourseInstance } from '../../models/student-label.js';
import {
  type AccessControlJson,
  AccessControlJsonSchema,
  MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE,
  MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS,
  MAX_ACCESS_CONTROL_RULES,
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
} from '../../schemas/accessControl.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';
import { throwAppError } from '../app-errors.js';

import {
  requireCourseInstancePermissionView,
  requireCoursePermissionEdit,
  requireCoursePermissionEditOrCourseInstancePermissionView,
  t,
} from './init.js';

export interface AccessControlError {
  SaveAllRules: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

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

const studentLabels = t.procedure
  .use(requireCoursePermissionEditOrCourseInstancePermissionView)
  .query(async (opts) => {
    const labels = await selectStudentLabelsInCourseInstance(opts.ctx.course_instance);
    return labels.map((label) => StaffStudentLabelSchema.parse(label));
  });

const prairieTestExamMetadata = t.procedure
  .use(requireCoursePermissionEditOrCourseInstancePermissionView)
  .input(z.object({ examUuids: z.array(z.uuid()).max(MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS) }))
  .query(async (opts) => {
    return await selectPrairieTestExamMetadataByUuids(opts.input.examUuids);
  });

export function formJsonToEnrollmentRuleData(
  rule: AccessControlJson & { id?: string },
): EnrollmentAccessControlRuleData {
  const dc = rule.dateControl;
  const ac = rule.afterComplete;
  const afterLastDeadline = dc?.afterLastDeadline;
  const afterLastDeadlineAllowSubmissions = afterLastDeadline?.allowSubmissions ?? null;
  return {
    id: rule.id,
    beforeReleaseListed: rule.beforeRelease?.listed ?? null,
    releaseDate: dc?.release?.date ?? null,
    dueOverridden: dc?.due !== undefined,
    dueDate: dc?.due?.date ?? null,
    dueCredit: dc?.due?.credit ?? null,
    earlyDeadlinesOverridden: dc?.earlyDeadlines !== undefined,
    lateDeadlinesOverridden: dc?.lateDeadlines !== undefined,
    afterLastDeadlineAllowSubmissions,
    afterLastDeadlineCredit:
      afterLastDeadline?.allowSubmissions === true ? afterLastDeadline.credit : null,
    durationMinutesOverridden: dc?.durationMinutes !== undefined,
    durationMinutes: dc?.durationMinutes ?? null,
    passwordOverridden: dc?.password !== undefined,
    password: dc?.password ?? null,
    questionsHidden: ac?.questions?.hidden ?? null,
    questionsVisibleFromDate: ac?.questions?.visibleFromDate ?? null,
    questionsVisibleUntilDate: ac?.questions?.visibleUntilDate ?? null,
    scoreHidden: ac?.score?.hidden ?? null,
    scoreVisibleFromDate: ac?.score?.visibleFromDate ?? null,
    earlyDeadlines: dc?.earlyDeadlines ?? [],
    lateDeadlines: dc?.lateDeadlines ?? [],
  };
}

const AccessControlJsonInputSchema = AccessControlJsonSchema.extend({
  id: IdSchema.optional(),
}).strip();
type AccessControlJsonInputWithId = z.infer<typeof AccessControlJsonInputSchema>;

const EnrollmentRuleInputSchema = z.object({
  id: IdSchema.optional(),
  enrollmentIds: z.array(IdSchema).max(MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE),
  ruleJson: AccessControlJsonInputSchema,
});
type EnrollmentRuleInput = z.infer<typeof EnrollmentRuleInputSchema>;

function isNonEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function stripRuleId(rule: AccessControlJsonInputWithId): AccessControlJson {
  const { id: _id, ...jsonRule } = rule;
  return jsonRule;
}

function validateRuleInputTargets(
  rules: AccessControlJsonInputWithId[],
  enrollmentRules: EnrollmentRuleInput[] | undefined,
) {
  if (rules.length === 0 && (enrollmentRules?.length ?? 0) > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A default access control rule is required when saving student-specific rules.',
    });
  }

  if (rules[0]?.uuid != null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The default access control rule must not specify a UUID.',
    });
  }

  for (const [index, rule] of rules.entries()) {
    if (index === 0) continue;
    if (rule.labels == null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Student-specific access control rules must be submitted via enrollmentRules, not rules.',
      });
    }
    if (rule.uuid == null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Non-default access control rules must include a UUID.',
      });
    }
  }

  for (const enrollmentRule of enrollmentRules ?? []) {
    if (enrollmentRule.ruleJson.labels != null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Student-label access control rules must be submitted via rules, not enrollmentRules.',
      });
    }
    if (enrollmentRule.ruleJson.uuid == null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Student-specific access control rules must include a UUID.',
      });
    }
    if (new Set(enrollmentRule.enrollmentIds).size !== enrollmentRule.enrollmentIds.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Duplicate enrollment IDs are not allowed in student-specific assignments.',
      });
    }
  }
}

function getEnrollmentRulesWithUuids(rules: AccessControlJson[] | undefined) {
  return (rules ?? []).slice(1).filter((rule): rule is AccessControlJson & { uuid: string } => {
    return rule.uuid != null && rule.labels == null;
  });
}

function prepareRulesForDisk(
  submittedRules: AccessControlJson[],
  submittedEnrollmentRules: EnrollmentRuleInput[] | undefined,
  diskRules: AccessControlJson[] | undefined,
): AccessControlJson[] {
  if (submittedEnrollmentRules !== undefined) {
    return [
      ...submittedRules,
      ...submittedEnrollmentRules.map((enrollmentRule) => stripRuleId(enrollmentRule.ruleJson)),
    ];
  }

  const submittedUuids = new Set(
    submittedRules.map((rule) => rule.uuid).filter((uuid): uuid is string => uuid !== undefined),
  );
  const preservedEnrollmentRules = getEnrollmentRulesWithUuids(diskRules).filter((rule) => {
    return !submittedUuids.has(rule.uuid);
  });
  return [...submittedRules, ...preservedEnrollmentRules];
}

/**
 * Cleans access control rules for writing to infoAssessment.json on disk.
 * Removes empty objects and omits default-valued settings on the default rule.
 */
export function cleanAccessControlRulesForDisk(rules: AccessControlJson[]): AccessControlJson[] {
  return rules.map((rule, index) => {
    const clean: Record<string, unknown> = {};

    if (index > 0 && rule.uuid != null) {
      clean.uuid = rule.uuid;
    }

    if (index > 0 && rule.labels != null) {
      clean.labels = rule.labels;
    }

    if (index === 0 && rule.beforeRelease?.listed === true) {
      clean.beforeRelease = { listed: true };
    }

    if (isNonEmptyObject(rule.dateControl)) {
      const dateControl = { ...rule.dateControl };
      if (index === 0 && dateControl.afterLastDeadline?.allowSubmissions === false) {
        delete dateControl.afterLastDeadline;
      }
      if (isNonEmptyObject(dateControl)) {
        clean.dateControl = dateControl;
      }
    }

    if (rule.integrations && isNonEmptyObject(rule.integrations)) {
      clean.integrations = rule.integrations;
    }

    if (isNonEmptyObject(rule.afterComplete)) {
      const afterComplete = { ...rule.afterComplete };
      if (index === 0) {
        if (
          afterComplete.questions?.hidden === true &&
          afterComplete.questions.visibleFromDate == null &&
          afterComplete.questions.visibleUntilDate == null
        ) {
          delete afterComplete.questions;
        }
        if (afterComplete.score?.hidden === false && afterComplete.score.visibleFromDate == null) {
          delete afterComplete.score;
        }
      }
      if (isNonEmptyObject(afterComplete)) {
        clean.afterComplete = afterComplete;
      }
    }

    return clean;
  });
}

const saveAllRules = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      rules: z.array(AccessControlJsonInputSchema).max(MAX_ACCESS_CONTROL_RULES),
      // Omitted enrollmentRules leave student-specific overrides unchanged;
      // an empty array explicitly removes them.
      enrollmentRules: z
        .array(EnrollmentRuleInputSchema)
        .max(MAX_ENROLLMENT_ACCESS_CONTROL_RULES)
        .optional(),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { rules, enrollmentRules, origHash } = opts.input;
    if (opts.ctx.course.example_course) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Editing access settings is not permitted for the example course.',
      });
    }
    if (enrollmentRules !== undefined && !opts.ctx.authz_data.has_course_instance_permission_edit) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied (must be a student data editor)',
      });
    }
    validateRuleInputTargets(rules, enrollmentRules);

    const submittedRules = rules.map((rule, index) => {
      const jsonRule = stripRuleId(rule);
      if (index === 0) {
        const { uuid: _uuid, ...defaultRule } = jsonRule;
        return defaultRule;
      }
      return jsonRule;
    });
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
    }

    const assessmentDir = path.join(
      opts.ctx.course.path,
      'courseInstances',
      opts.ctx.course_instance.short_name,
      'assessments',
      opts.ctx.assessment.tid!,
    );
    const assessmentPath = path.join(assessmentDir, 'infoAssessment.json');

    const saveResult = await saveJsonFile<AssessmentJsonInput>({
      applyChanges: (jsonContents) => {
        const rulesToSync = prepareRulesForDisk(
          submittedRules,
          enrollmentRules,
          jsonContents.accessControl,
        );
        const cleanedRulesToSync = cleanAccessControlRulesForDisk(rulesToSync);

        const { errors: validationErrors } = validateAccessControlRules({
          rules: cleanedRulesToSync,
        });
        if (validationErrors.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: validationErrors[0] });
        }

        jsonContents.accessControl = cleanedRulesToSync;
        return jsonContents;
      },
      jsonPath: assessmentPath,
      // Scope the hash to just the accessControl section so unrelated file
      // changes (e.g. zones) don't trigger spurious conflicts.
      conflictCheck: {
        origHash,
        scope: (json) => json.accessControl ?? [],
      },
      locals: {
        authz_data: opts.ctx.authz_data,
        course: opts.ctx.course,
        user: opts.ctx.authn_user,
      },
      container: {
        rootPath: assessmentDir,
        invalidRootPaths: [],
      },
    });

    if (!saveResult.success) {
      if (saveResult.reason === 'conflict') {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The access control rules have been modified since you loaded this page. Please refresh and try again.',
        });
      }
      throwAppError<AccessControlError>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save access control rules',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    if (enrollmentRules !== undefined) {
      const savedEnrollmentRules =
        enrollmentRules.length > 0
          ? await selectAccessControlRules(opts.ctx.assessment, ['enrollment'])
          : [];
      const savedEnrollmentRuleIdByUuid = new Map(
        savedEnrollmentRules
          .filter((rule): rule is AccessControlJsonWithId & { id: string; uuid: string } => {
            return rule.uuid != null;
          })
          .map((rule) => [rule.uuid, rule.id]),
      );

      // TODO: Add audit logging for enrollment rule changes. Label/default rules
      // are tracked in git; only enrollment rules need separate audit logs.
      await replaceEnrollmentAccessControlRules(
        opts.ctx.assessment,
        enrollmentRules.map((enrollmentRule) => {
          const ruleData = formJsonToEnrollmentRuleData(enrollmentRule.ruleJson);
          const uuid = enrollmentRule.ruleJson.uuid;
          const id = uuid == null ? undefined : savedEnrollmentRuleIdByUuid.get(uuid);
          if (id == null) {
            throw new Error(`Synced student-specific access control rule not found: ${uuid}`);
          }
          ruleData.id = id;
          return {
            ruleData,
            enrollmentIds: enrollmentRule.enrollmentIds,
          };
        }),
      );
    }

    return { newHash: saveResult.newHash };
  });

export const accessControlRouter = t.router({
  students,
  studentLabels,
  prairieTestExamMetadata,
  saveAllRules,
});
