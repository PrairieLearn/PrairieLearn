import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AccessControlGroupSchema, AccessControlSchema, IdSchema } from '../../lib/db-types.js';
import type { AccessControlJson } from '../../schemas/accessControl.js';
import type { CourseInstanceData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

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
  const validGroupIds = new Set(existingGroups.map((g) => g.uuid.toString()));

  const existingRules = await queryRows(
    sql.select_access_control,
    { assessment_id: assessmentId },
    AccessControlSchema,
  );

  await runInTransactionAsync(async () => {
    // delete existing rules and related data
    // TODO: probably should make this an upsert if possible.
    if (existingRules.length > 0) {
      await execute(sql.delete_access_control_targets, {
        access_control_ids: existingRules.map((r) => r.id),
      });
      await execute(sql.delete_access_control_early_deadlines, {
        access_control_ids: existingRules.map((r) => r.id),
      });
      await execute(sql.delete_access_control_late_deadlines, {
        access_control_ids: existingRules.map((r) => r.id),
      });
      await execute(sql.delete_access_control_prairietest_exams, {
        access_control_ids: existingRules.map((r) => r.id),
      });
      await execute(sql.delete_access_control, {
        assessment_id: assessmentId,
      });
    }

    // For each rule, insert
    for (let i = 0; i < accessControlRules.length; i++) {
      const ruleInfo = accessControlRules[i];
      if (infofile.hasErrors(ruleInfo) || !ruleInfo.data) continue;

      const rule = ruleInfo.data;
      const order = i + 1;

      // parse targets as group IDs
      const groupTargets: string[] = [];
      const missingGroups: string[] = [];

      (rule.targets ?? []).forEach((target) => {
        // targets are access_control_group.uuid values
        if (validGroupIds.has(target)) {
          groupTargets.push(target);
        } else {
          missingGroups.push(target);
        }
      });

      // warn about groups that don't exist
      if (missingGroups.length > 0) {
        infofile.addWarning(
          ruleInfo,
          `The following group IDs do not exist and will be ignored: ${missingGroups.join(', ')}. Create these groups in the UI first.`,
        );
      }

      // insert main access control rule
      const dateControl = rule.dateControl ?? {};
      const afterComplete = rule.afterComplete ?? {};

      const insertedRule = await queryRows(
        sql.insert_access_control,
        {
          course_instance_id: courseInstanceId,
          assessment_id: assessmentId,
          enabled: rule.enabled,
          block_access: rule.blockAccess,
          list_before_release: rule.listBeforeRelease ?? null,
          order,
          // Date control fields
          date_control_enabled: dateControl.enabled ?? null,
          date_control_release_date_enabled: dateControl.releaseDateEnabled ?? null,
          date_control_release_date: dateControl.releaseDate ?? null,
          date_control_due_date_enabled: dateControl.dueDateEnabled ?? null,
          date_control_due_date: dateControl.dueDate ?? null,
          date_control_early_deadlines_enabled: dateControl.earlyDeadlinesEnabled ?? null,
          date_control_late_deadlines_enabled: dateControl.lateDeadlinesEnabled ?? null,
          date_control_after_last_deadline_allow_submissions:
            dateControl.afterLastDeadline?.allowSubmissions ?? null,
          date_control_after_last_deadline_credit_enable:
            dateControl.afterLastDeadline?.creditEnabled ?? null,
          date_control_after_last_deadline_credit: dateControl.afterLastDeadline?.credit ?? null,
          date_control_duration_minutes_enabled: dateControl.durationMinutesEnabled ?? null,
          date_control_duration_minutes: dateControl.durationMinutes ?? null,
          date_control_password_enabled: dateControl.passwordEnabled ?? null,
          date_control_password: dateControl.password ?? null,
          // PrairieTest control
          prairietest_control_enable: rule.prairieTestControl?.enabled ?? null,
          // After complete fields
          after_complete_hide_questions_before_date_enabled:
            afterComplete.hideQuestionsDateControl?.showAgainDateEnabled ?? null,
          after_complete_hide_questions_before_date:
            afterComplete.hideQuestionsDateControl?.showAgainDate ?? null,
          after_complete_hide_questions_after_date_enabled:
            afterComplete.hideQuestionsDateControl?.hideAgainDateEnabled ?? null,
          after_complete_hide_questions_after_date:
            afterComplete.hideQuestionsDateControl?.hideAgainDate ?? null,
          after_complete_hide_score_before_date_enabled:
            afterComplete.hideScoreDateControl?.showAgainDateEnabled ?? null,
          after_complete_hide_score_before_date:
            afterComplete.hideScoreDateControl?.showAgainDate ?? null,
        },
        AccessControlSchema,
      );

      const accessControlId = insertedRule[0].id;

      // insert targets (group references)
      if (groupTargets.length > 0) {
        // get db id for each group
        const groupIdMap = new Map(existingGroups.map((g) => [g.uuid.toString(), g.id]));

        await execute(sql.insert_access_control_targets, {
          targets: groupTargets.map((groupId) =>
            JSON.stringify([accessControlId, 'group', groupIdMap.get(groupId)]),
          ),
        });
      }

      // insert early deadlines
      if (dateControl.earlyDeadlines && dateControl.earlyDeadlines.length > 0) {
        await execute(sql.insert_access_control_early_deadlines, {
          deadlines: dateControl.earlyDeadlines.map((d) =>
            JSON.stringify([accessControlId, d.date, d.credit]),
          ),
        });
      }

      // insert late deadlines
      if (dateControl.lateDeadlines && dateControl.lateDeadlines.length > 0) {
        await execute(sql.insert_access_control_late_deadlines, {
          deadlines: dateControl.lateDeadlines.map((d) =>
            JSON.stringify([accessControlId, d.date, d.credit]),
          ),
        });
      }

      // insert PrairieTest exams
      if (rule.prairieTestControl?.exams && rule.prairieTestControl.exams.length > 0) {
        const examUuids = rule.prairieTestControl.exams.map((e) => e.examUuid);

        // uuid => exams(id)
        const examResults = await queryRows(
          sql.get_exam_ids_by_uuids,
          {
            exam_uuids: examUuids,
            course_id: courseId,
          },
          z.object({ uuid: z.string(), exam_id: IdSchema }),
        );

        const uuidToExamIdMap = new Map(examResults.map((r) => [r.uuid, r.exam_id]));

        // check for missing exam UUIDs and add warnings
        const missingUuids = examUuids.filter((uuid) => !uuidToExamIdMap.has(uuid));
        if (missingUuids.length > 0) {
          infofile.addWarning(
            ruleInfo,
            `The following exam UUIDs were not found: ${missingUuids.join(', ')}. Ensure you copied the correct UUIDs from PrairieTest.`,
          );
        }

        // insert only exams that were found
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
  });
}

/** todo: make syncfromdisk call this */
export async function sync(
  courseId: string,
  courseInstanceId: string,
  courseInstanceData: CourseInstanceData,
  assessmentIds: Record<string, string>,
): Promise<void> {
  for (const [tid, _] of Object.entries(courseInstanceData.assessments)) {
    const assessmentId = assessmentIds[tid];
    if (!assessmentId) continue;

    const accessControlRules = courseInstanceData.assessmentAccessControl[tid] ?? [];

    await syncAccessControl(courseId, courseInstanceId, assessmentId, accessControlRules);
  }
}
