import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AccessControlGroupSchema, AccessControlSchema, IdSchema } from '../../lib/db-types.js';
import type { AccessControlJson } from '../../schemas/accessControl.js';
import type { CourseInstanceData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Maps a JSON field value to database overridden/value pair.
 * - undefined → overridden: false, value: null (inherit from previous rule)
 * - null → overridden: true, value: null (override and unset)
 * - value → overridden: true, value: value (override and set)
 */
function mapField<T>(jsonValue: T | null | undefined): {
  overridden: boolean | null;
  value: T | null;
} {
  if (jsonValue === undefined) {
    return { overridden: false, value: null };
  } else if (jsonValue === null) {
    return { overridden: true, value: null };
  } else {
    return { overridden: true, value: jsonValue };
  }
}

/**
 * Syncs access control rules for an assessment.
 */
export async function syncAccessControl(
  courseId: string,
  courseInstanceId: string,
  assessmentId: string,
  accessControlRules: infofile.InfoFile<AccessControlJson>[],
): Promise<void> {
  // load existing groups to validate that group IDs exist
  const existingGroups = await queryRows(
    sql.select_groups,
    { course_instance_id: courseInstanceId },
    AccessControlGroupSchema,
  );
  const validGroupIds = new Map(existingGroups.map((g) => [g.uuid.toString(), g.id]));

  // validate all rules and check for errors
  for (const ruleInfo of accessControlRules) {
    if (infofile.hasErrors(ruleInfo) || !ruleInfo.data) continue;

    const rule = ruleInfo.data;

    // Validate group targets
    const invalidGroups: string[] = [];
    (rule.targets ?? []).forEach((target) => {
      if (!validGroupIds.has(target)) {
        invalidGroups.push(target);
      }
    });

    if (invalidGroups.length > 0) {
      infofile.addError(
        ruleInfo,
        `The following group IDs do not exist: ${invalidGroups.join(', ')}. Create these groups in the UI first.`,
      );
    }
  }

  // check if any rule has errors
  const hasAnyErrors = accessControlRules.some((ruleInfo) => infofile.hasErrors(ruleInfo));
  if (hasAnyErrors) {
    // don't sync any rules if any rule has errors
    return;
  }

  // get all existing rules with their targets
  const existingRules = await queryRows(
    sql.select_access_control_with_targets,
    { assessment_id: assessmentId },
    z.object({
      id: IdSchema,
      order: z.number(),
      target_types: z.array(z.enum(['assessment', 'group', 'individual'])).nullable(),
    }),
  );

  await runInTransactionAsync(async () => {
    // For allowing temporary unique violations for reordering.
    await execute(
      'SET CONSTRAINTS access_control_course_instance_id_assessment_id_order_key DEFERRED',
    );

    // Find individual-level rules; these should not be deleted in sync
    const individualRuleIds = existingRules
      .filter((rule) => rule.target_types?.includes('individual'))
      .map((rule) => rule.id);

    // Identify rules to delete (assignment and group level only)
    const rulesToDelete = existingRules.filter((rule) => !individualRuleIds.includes(rule.id));

    // Delete assessment and group-level rules
    if (rulesToDelete.length > 0) {
      const idsToDelete = rulesToDelete.map((r) => r.id);

      await execute(sql.delete_access_control_targets, {
        access_control_ids: idsToDelete,
      });
      await execute(sql.delete_access_control_early_deadlines, {
        access_control_ids: idsToDelete,
      });
      await execute(sql.delete_access_control_late_deadlines, {
        access_control_ids: idsToDelete,
      });
      await execute(sql.delete_access_control_prairietest_exams, {
        access_control_ids: idsToDelete,
      });
      await execute(sql.delete_access_control_by_ids, {
        ids: idsToDelete,
      });
    }

    // Insert new assessment-level and group-level rules from JSON
    for (let i = 0; i < accessControlRules.length; i++) {
      const ruleInfo = accessControlRules[i];
      if (infofile.hasErrors(ruleInfo) || !ruleInfo.data) continue;

      const rule = ruleInfo.data;
      const order = i + 1;

      // Find valid group targets
      const groupTargets: string[] = [];
      (rule.targets ?? []).forEach((target) => {
        if (validGroupIds.has(target)) {
          groupTargets.push(target);
        }
      });

      // Extract nested objects or {}
      const dateControl = rule.dateControl ?? {};
      const afterComplete = rule.afterComplete ?? {};
      const afterLastDeadline = dateControl.afterLastDeadline ?? {};

      // Map JSON -> DB override representation
      const enabled = mapField(rule.enabled);
      const blockAccess = mapField(rule.blockAccess);
      const listBeforeRelease = mapField(rule.listBeforeRelease);

      // Date control fields
      // const dateControlOverridden = mapField(dateControl.enabled);
      // dateControlOverridden is implicitly set if any of its properties are overriden

      const releaseDateOverridden = mapField(dateControl.releaseDate);
      const dueDateOverridden = mapField(dateControl.dueDate);
      const earlyDeadlinesOverridden = mapField(dateControl.earlyDeadlines);
      const lateDeadlinesOverridden = mapField(dateControl.lateDeadlines);
      const durationMinutesOverridden = mapField(dateControl.durationMinutes);
      const passwordOverridden = mapField(dateControl.password);

      // After Last Deadline
      const afterLastDeadlineAllowSubmissions = mapField(afterLastDeadline.allowSubmissions);
      const afterLastDeadlineCreditOverridden = mapField(afterLastDeadline.credit);
      const dateControlOverridden = {
        overridden:
          releaseDateOverridden.overridden ||
          dueDateOverridden.overridden ||
          earlyDeadlinesOverridden.overridden ||
          lateDeadlinesOverridden.overridden ||
          durationMinutesOverridden.overridden ||
          passwordOverridden.overridden ||
          afterLastDeadlineAllowSubmissions.overridden ||
          afterLastDeadlineCreditOverridden.overridden,
        value: null, // This field isn't actually used, just needs to match the structure
      };

      // PrairieTestControl
      // const prairietestControlOverridden = mapField(rule.prairieTestControl?.enabled);
      const prairietestControlOverridden = {
        overridden: rule.prairieTestControl?.exams !== undefined,
        value: null,
      };

      // After Complete
      const hideQuestions = mapField(afterComplete.hideQuestions);
      const hideQuestionsShowAgainDateOverridden = mapField(afterComplete.showQuestionsAgainDate);
      const hideQuestionsHideAgainDateOverridden = mapField(afterComplete.hideQuestionsAgainDate);
      const hideScore = mapField(afterComplete.hideScore);
      const hideScoreShowAgainDateOverridden = mapField(afterComplete.showScoreAgainDate);

      // Insert main rule
      const insertedRule = await queryRows(
        sql.insert_access_control,
        {
          course_instance_id: courseInstanceId,
          assessment_id: assessmentId,
          enabled: enabled.value || true,
          block_access: blockAccess.value || false,
          list_before_release: listBeforeRelease.value || true,
          order,

          // Date control
          date_control_overridden: dateControlOverridden.overridden,
          date_control_release_date_overridden: releaseDateOverridden.overridden,
          date_control_release_date: releaseDateOverridden.value,
          date_control_due_date_overridden: dueDateOverridden.overridden,
          date_control_due_date: dueDateOverridden.value,
          date_control_early_deadlines_overridden: earlyDeadlinesOverridden.overridden,
          date_control_late_deadlines_overridden: lateDeadlinesOverridden.overridden,
          date_control_after_last_deadline_allow_submissions:
            afterLastDeadlineAllowSubmissions.value,
          date_control_after_last_deadline_credit_overridden:
            afterLastDeadlineCreditOverridden.overridden,
          date_control_after_last_deadline_credit: afterLastDeadlineCreditOverridden.value,
          date_control_duration_minutes_overridden: durationMinutesOverridden.overridden,
          date_control_duration_minutes: durationMinutesOverridden.value,
          date_control_password_overridden: passwordOverridden.overridden,
          date_control_password: passwordOverridden.value,

          // PrairieTest control
          prairietest_control_overridden: prairietestControlOverridden.overridden,

          // After complete
          after_complete_hide_questions: hideQuestions.value,
          after_complete_hide_questions_show_again_date_overridden:
            hideQuestionsShowAgainDateOverridden.overridden,
          after_complete_hide_questions_show_again_date: hideQuestionsShowAgainDateOverridden.value,
          after_complete_hide_questions_hide_again_date_overridden:
            hideQuestionsHideAgainDateOverridden.overridden,
          after_complete_hide_questions_hide_again_date: hideQuestionsHideAgainDateOverridden.value,
          after_complete_hide_score: hideScore.value,
          after_complete_hide_score_show_again_date_overridden:
            hideScoreShowAgainDateOverridden.overridden,
          after_complete_hide_score_show_again_date: hideScoreShowAgainDateOverridden.value,
        },
        AccessControlSchema,
      );

      const accessControlId = insertedRule[0].id;

      // Insert targets
      if (groupTargets.length > 0) {
        // Target is group
        await execute(sql.insert_access_control_targets, {
          targets: groupTargets.map((groupUuid) =>
            JSON.stringify([accessControlId, 'group', validGroupIds.get(groupUuid)]),
          ),
        });
      } else {
        // Target is assessment
        await execute(sql.insert_access_control_targets, {
          targets: [JSON.stringify([accessControlId, 'assessment', assessmentId])],
        });
      }

      // Insert early deadlines if overridden and has values
      if (
        earlyDeadlinesOverridden.overridden &&
        earlyDeadlinesOverridden.value &&
        earlyDeadlinesOverridden.value.length > 0
      ) {
        await execute(sql.insert_access_control_early_deadlines, {
          deadlines: earlyDeadlinesOverridden.value.map((d) =>
            JSON.stringify([accessControlId, d.date, d.credit]),
          ),
        });
      }

      // Insert late deadlines if overridden and has values
      if (
        lateDeadlinesOverridden.overridden &&
        lateDeadlinesOverridden.value &&
        lateDeadlinesOverridden.value.length > 0
      ) {
        await execute(sql.insert_access_control_late_deadlines, {
          deadlines: lateDeadlinesOverridden.value.map((d) =>
            JSON.stringify([accessControlId, d.date, d.credit]),
          ),
        });
      }

      // Insert PrairieTest exams if present
      if (rule.prairieTestControl?.exams && rule.prairieTestControl.exams.length > 0) {
        const examUuids = rule.prairieTestControl.exams.map((e) => e.examUuid);

        // lookup exam IDs by UUIDs
        const examResults = await queryRows(
          sql.get_exam_ids_by_uuids,
          {
            exam_uuids: examUuids,
            course_id: courseId,
          },
          z.object({ uuid: z.string(), exam_id: IdSchema }),
        );

        const uuidToExamIdMap = new Map(examResults.map((r) => [r.uuid, r.exam_id]));

        // warn about missing exam UUIDs
        const missingUuids = examUuids.filter((uuid) => !uuidToExamIdMap.has(uuid));
        if (missingUuids.length > 0) {
          infofile.addWarning(
            ruleInfo,
            `The following exam UUIDs were not found: ${missingUuids.join(', ')}. Ensure you copied the correct UUIDs from PrairieTest.`,
          );
        }

        // TODO: is this the behaviour we want? Should we just fail instead?
        // insert only found exams
        const validExams = rule.prairieTestControl.exams.filter((e) =>
          uuidToExamIdMap.has(e.examUuid),
        );

        if (validExams.length > 0) {
          await execute(sql.insert_access_control_prairietest_exams, {
            exams: validExams.map((e) =>
              JSON.stringify([
                accessControlId,
                uuidToExamIdMap.get(e.examUuid),
                e.readOnly ?? false,
              ]),
            ),
          });
        }
      }
    }

    // Update order numbers for individual-level rules
    if (individualRuleIds.length > 0) {
      const newMaxOrder = accessControlRules.length;
      await execute(sql.update_individual_rule_orders, {
        assessment_id: assessmentId,
        start_order: newMaxOrder + 1,
      });
    }
  });
}

export async function sync(
  courseId: string,
  courseInstanceId: string,
  courseInstanceData: CourseInstanceData,
  assessmentIds: Record<string, string>,
): Promise<void> {
  for (const tid of Object.keys(courseInstanceData.assessments)) {
    const assessmentId = assessmentIds[tid];
    if (!assessmentId) continue;

    const accessControlRules = courseInstanceData.assessmentAccessControl?.[tid] ?? [];

    await syncAccessControl(courseId, courseInstanceId, assessmentId, accessControlRules);
  }
}
