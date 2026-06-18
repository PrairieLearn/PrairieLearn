import { randomUUID } from 'node:crypto';
import * as path from 'path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  normalizeAccessControlRules,
  validateAccessControlRules,
} from '../../lib/assessment-access-control/validation.js';
import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { prepareJsonFileEditor } from '../../lib/editors.js';
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
  SaveAllRules:
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string }
    | { code: 'ENROLLMENT_MAPPING_FAILED'; ruleUuids: string[] };
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

function prepareRulesForUuidFormat(
  rules: AccessControlJsonInputWithId[],
  existingNonDefaultRules: AccessControlJsonWithId[],
): AccessControlJson[] {
  const uuidByRuleId = new Map(
    existingNonDefaultRules
      .filter((rule): rule is AccessControlJsonWithId & { id: string; uuid: string } => {
        return rule.id != null && rule.uuid != null;
      })
      .map((rule) => [rule.id, rule.uuid]),
  );

  return rules.map((rule, index) => {
    const jsonRule = stripRuleId(rule);
    if (index === 0) {
      const { uuid: _uuid, ...defaultRule } = jsonRule;
      return defaultRule;
    }

    const existingUuid = rule.id ? uuidByRuleId.get(rule.id) : undefined;
    if (jsonRule.uuid != null || existingUuid != null || jsonRule.labels != null) {
      return {
        ...jsonRule,
        uuid: jsonRule.uuid ?? existingUuid ?? randomUUID(),
      };
    }

    return {
      ...jsonRule,
    };
  });
}

function preserveUnsubmittedDiskEnrollmentRules(
  submittedRules: AccessControlJson[],
  diskRules: AccessControlJson[] | undefined,
): AccessControlJson[] {
  const submittedUuids = new Set(
    submittedRules.map((rule) => rule.uuid).filter((uuid): uuid is string => uuid !== undefined),
  );
  const preservedEnrollmentRules = normalizeAccessControlRules(diskRules ?? [])
    .rules.filter(({ rule, targetType }) => {
      return targetType === 'enrollment' && rule.uuid != null && !submittedUuids.has(rule.uuid);
    })
    .map(({ rule }) => rule);

  return [...submittedRules, ...preservedEnrollmentRules];
}

function getJsonEnrollmentRuleUuids(rules: AccessControlJson[]): Set<string> {
  const normalizedRules = normalizeAccessControlRules(rules);
  return new Set(
    normalizedRules.rules
      .filter(({ targetType }) => targetType === 'enrollment')
      .map(({ rule }) => rule.uuid)
      .filter((uuid): uuid is string => uuid !== undefined),
  );
}

function missesExistingEnrollmentRule(
  rules: AccessControlJson[],
  existingEnrollmentRules: AccessControlJsonWithId[],
): boolean {
  const jsonEnrollmentRuleUuids = getJsonEnrollmentRuleUuids(rules);
  return existingEnrollmentRules.some((rule) => {
    return rule.uuid == null || !jsonEnrollmentRuleUuids.has(rule.uuid);
  });
}

function convertToOldFormatRules(rules: AccessControlJson[]): AccessControlJson[] {
  return rules.flatMap((rule, index) => {
    const { uuid: _uuid, ...oldFormatRule } = rule;
    if (index > 0 && rule.labels == null) return [];
    return oldFormatRule;
  });
}

function prepareRulesForDisk(
  submittedRules: AccessControlJson[],
  diskRules: AccessControlJson[] | undefined,
  existingEnrollmentRules: AccessControlJsonWithId[],
  preserveEnrollmentRules: boolean,
): AccessControlJson[] {
  if (!preserveEnrollmentRules) return submittedRules;

  const rulesWithPreservedEnrollmentRules = preserveUnsubmittedDiskEnrollmentRules(
    submittedRules,
    diskRules,
  );
  if (!missesExistingEnrollmentRule(rulesWithPreservedEnrollmentRules, existingEnrollmentRules)) {
    return rulesWithPreservedEnrollmentRules;
  }

  return convertToOldFormatRules(submittedRules);
}

function prepareEnrollmentRulesForUuidFormat(
  enrollmentRules: EnrollmentRuleInput[],
  existingNonDefaultRules: AccessControlJsonWithId[],
): EnrollmentRuleInput[] {
  const uuidByRuleId = new Map(
    existingNonDefaultRules
      .filter((rule): rule is AccessControlJsonWithId & { id: string; uuid: string } => {
        return rule.id != null && rule.uuid != null;
      })
      .map((rule) => [rule.id, rule.uuid]),
  );

  return enrollmentRules.map((enrollmentRule) => {
    const uuid =
      enrollmentRule.ruleJson.uuid ??
      (enrollmentRule.ruleJson.id ? uuidByRuleId.get(enrollmentRule.ruleJson.id) : undefined);

    if (uuid == null) return enrollmentRule;

    return {
      ...enrollmentRule,
      ruleJson: {
        ...enrollmentRule.ruleJson,
        uuid,
      },
    };
  });
}

function validateEnrollmentRuleMappings(
  enrollmentRules: EnrollmentRuleInput[] | undefined,
  jsonEnrollmentRuleUuids: Set<string>,
) {
  if (enrollmentRules === undefined || jsonEnrollmentRuleUuids.size === 0) return;

  const enrollmentMappingUuids = new Set<string>();
  for (const enrollmentRule of enrollmentRules) {
    const uuid = enrollmentRule.ruleJson.uuid;
    if (uuid == null || !jsonEnrollmentRuleUuids.has(uuid)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Student-specific assignment data must reference a saved student-specific access control rule UUID.',
      });
    }
    if (enrollmentMappingUuids.has(uuid)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Duplicate student-specific assignment data for access control rule UUID ${uuid}.`,
      });
    }
    enrollmentMappingUuids.add(uuid);
  }

  if (
    enrollmentMappingUuids.size !== jsonEnrollmentRuleUuids.size ||
    [...jsonEnrollmentRuleUuids].some((uuid) => !enrollmentMappingUuids.has(uuid))
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Student-specific assignment data is missing for one or more access control rules.',
    });
  }
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

    const existingNonDefaultRules = await selectAccessControlRules(opts.ctx.assessment, [
      'student_label',
      'enrollment',
    ]);
    const existingEnrollmentRules = existingNonDefaultRules.filter(
      (rule) => rule.ruleType === 'enrollment',
    );

    const submittedRules = prepareRulesForUuidFormat(rules, existingNonDefaultRules);
    const preparedEnrollmentRules =
      enrollmentRules === undefined
        ? undefined
        : prepareEnrollmentRulesForUuidFormat(enrollmentRules, existingNonDefaultRules);

    if (preparedEnrollmentRules !== undefined && preparedEnrollmentRules.length > 0) {
      const allEnrollmentIds = new Set(preparedEnrollmentRules.flatMap((r) => r.enrollmentIds));
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

    const preparedSave = await prepareJsonFileEditor<AssessmentJsonInput>({
      applyChanges: (jsonContents) => {
        const rulesToSync = prepareRulesForDisk(
          submittedRules,
          jsonContents.accessControl,
          existingEnrollmentRules,
          preparedEnrollmentRules === undefined,
        );
        jsonContents.accessControl = cleanAccessControlRulesForDisk(rulesToSync);
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

    if (!preparedSave.success) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'The access control rules have been modified since you loaded this page. Please refresh and try again.',
      });
    }

    const rulesToSync = preparedSave.jsonData.accessControl ?? [];
    const jsonEnrollmentRuleUuids = getJsonEnrollmentRuleUuids(rulesToSync);

    validateEnrollmentRuleMappings(preparedEnrollmentRules, jsonEnrollmentRuleUuids);

    const { errors: validationErrors } = validateAccessControlRules({
      rules: rulesToSync,
      enrollmentRules:
        jsonEnrollmentRuleUuids.size === 0 ? preparedEnrollmentRules?.map((r) => r.ruleJson) : [],
    });
    if (validationErrors.length > 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: validationErrors[0] });
    }

    const serverJob = await preparedSave.editor.prepareServerJob();
    try {
      await preparedSave.editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<AccessControlError>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save access control rules',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    if (preparedEnrollmentRules !== undefined) {
      try {
        const savedEnrollmentRules =
          jsonEnrollmentRuleUuids.size > 0
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
          preparedEnrollmentRules.map((enrollmentRule) => {
            const ruleData = formJsonToEnrollmentRuleData(enrollmentRule.ruleJson);
            if (jsonEnrollmentRuleUuids.size > 0) {
              const uuid = enrollmentRule.ruleJson.uuid;
              const id = uuid ? savedEnrollmentRuleIdByUuid.get(uuid) : undefined;
              if (id == null) {
                throw new Error(`Synced student-specific access control rule not found: ${uuid}`);
              }
              ruleData.id = id;
            } else if (enrollmentRule.id) {
              ruleData.id = enrollmentRule.id;
            }
            return {
              ruleData,
              enrollmentIds: enrollmentRule.enrollmentIds,
            };
          }),
        );
      } catch {
        throwAppError<AccessControlError['SaveAllRules']>(
          {
            code: 'ENROLLMENT_MAPPING_FAILED',
            message:
              'Access control rule bodies were saved, but student-specific assignments could not be updated. Refresh the page and retry.',
            ruleUuids: [...jsonEnrollmentRuleUuids],
          },
          'INTERNAL_SERVER_ERROR',
        );
      }
    }

    return { newHash: preparedSave.newHash };
  });

export const accessControlRouter = t.router({
  students,
  studentLabels,
  prairieTestExamMetadata,
  saveAllRules,
});
