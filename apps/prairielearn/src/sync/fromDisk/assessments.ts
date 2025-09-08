import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { IdSchema, SprocSyncAssessmentsSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { assertNever } from '../../lib/types.js';
import {
  type AssessmentJson,
  type QuestionAlternativeJson,
  type QuestionPointsJson,
  type ZoneQuestionJson,
} from '../../schemas/index.js';
import { type CourseInstanceData } from '../course-db.js';
import { isAccessRuleAccessibleInFuture } from '../dates.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

type AssessmentInfoFile = infofile.InfoFile<AssessmentJson>;

/**
 * SYNCING PROCESS:
 *
 * 1. Assign order_by number to every assessment
 * 2. Check that no UUIDs are duplicated within this course instance
 * 3. Check that no UUIDS are duplicated in any other course instance
 * 4. For each assessment...
 *   a) Insert an assessment; associate the ID of the new assessment with the assessment object
 *   b) For each access rule from the assessment...
 *     i) Ensure that a PS exam exists if needed (if an `examUuid` exists)
 *     ii) Insert the access rule with a new number
 *   c) Delete excess assessment access rules
 *   d) For each zone from the assessment...
 *     i) Insert the zone with a new number; associate the ID of the new zone with the zone object
 *   e) Delete any excess zones from the current assessment using the zone number
 *   f) For each zone from the assessment...
 *     i) Generate a list of alternatives for the zone (either one or many questions, depending on if `id` or `alternatives` is used)
 *     ii) Insert a new alternative group
 *     iii) For each alternative in the group...
 *       1. Insert an assessment question
 *   g) Delete excess alternative groups
 *   h) Soft-delete unused assessments (that were deleted since the last sync)
 *   i) Soft-delete unused assessment questions (from deleted assessments)
 *   j) Soft-delete unused assessment questions (from deleted assessments)
 *   k) Delete unused assessment access rules (from deleted assessments)
 *   l) Delete unused zones (from deletes assessments)
 */

function getParamsForAssessment(
  assessmentInfoFile: AssessmentInfoFile,
  questionIds: Record<string, any>,
) {
  if (infofile.hasErrors(assessmentInfoFile)) return null;
  const assessment = assessmentInfoFile.data;
  if (!assessment) throw new Error(`Missing assessment data for ${assessmentInfoFile.uuid}`);

  // It used to be the case that assessment access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const allowAccess = assessment.allowAccess
    .filter((accessRule) => accessRule.role == null || accessRule.role === 'Student')
    .map((accessRule, index) => {
      return {
        number: index + 1,
        mode: run(() => {
          if (accessRule.mode) return accessRule.mode;
          if (accessRule.examUuid) return 'Exam';
          return null;
        }),
        uids: accessRule.uids ?? null,
        start_date: accessRule.startDate ?? null,
        end_date: accessRule.endDate ?? null,
        credit: accessRule.credit ?? null,
        time_limit_min: accessRule.timeLimitMin ?? null,
        password: accessRule.password ?? null,
        exam_uuid: accessRule.examUuid ?? null,
        show_closed_assessment: accessRule.showClosedAssessment,
        show_closed_assessment_score: accessRule.showClosedAssessmentScore,
        active: accessRule.active,
        comment: accessRule.comment,
      };
    });

  const zones = assessment.zones.map((zone, index) => {
    return {
      number: index + 1,
      title: zone.title,
      number_choose: zone.numberChoose ?? null,
      max_points: zone.maxPoints,
      best_questions: zone.bestQuestions,
      advance_score_perc: zone.advanceScorePerc,
      grade_rate_minutes: zone.gradeRateMinutes,
      json_can_view: zone.canView,
      json_can_submit: zone.canSubmit,
      comment: zone.comment,
    };
  });

  let alternativeGroupNumber = 0;
  let assessmentQuestionNumber = 0;
  const allRoleNames = assessment.groupRoles.map((role) => role.name);
  const assessmentCanView = assessment.canView.length > 0 ? assessment.canView : allRoleNames;
  const assessmentCanSubmit = assessment.canSubmit.length > 0 ? assessment.canSubmit : allRoleNames;
  const alternativeGroups = assessment.zones.map((zone) => {
    const zoneGradeRateMinutes = zone.gradeRateMinutes ?? assessment.gradeRateMinutes ?? 0;
    const zoneCanView = zone.canView.length > 0 ? zone.canView : assessmentCanView;
    const zoneCanSubmit = zone.canSubmit.length > 0 ? zone.canSubmit : assessmentCanSubmit;
    return zone.questions.map((question) => {
      let alternatives: (Omit<
        QuestionPointsJson,
        'maxPoints' | 'points' | 'maxAutoPoints' | 'autoPoints' | 'manualPoints'
      > &
        Omit<
          QuestionAlternativeJson,
          'id' | 'maxPoints' | 'points' | 'maxAutoPoints' | 'autoPoints' | 'manualPoints'
        > & {
          qid: QuestionAlternativeJson['id'];
          jsonGradeRateMinutes: QuestionAlternativeJson['gradeRateMinutes'];
          canView: ZoneQuestionJson['canView'];
          canSubmit: ZoneQuestionJson['canSubmit'];
          maxPoints: number | null;
          points: number | number[] | null;
          maxAutoPoints: number | null;
          autoPoints: number | number[] | null;
          manualPoints: number | null;
        })[] = [];
      const questionGradeRateMinutes = question.gradeRateMinutes ?? zoneGradeRateMinutes;
      const questionCanView = question.canView.length > 0 ? question.canView : zoneCanView;
      const questionCanSubmit = question.canSubmit.length > 0 ? question.canSubmit : zoneCanSubmit;
      if (question.alternatives) {
        alternatives = question.alternatives.map((alternative) => {
          return {
            qid: alternative.id,
            maxPoints: alternative.maxPoints ?? question.maxPoints ?? null,
            points: alternative.points ?? question.points ?? null,
            maxAutoPoints: alternative.maxAutoPoints ?? question.maxAutoPoints ?? null,
            autoPoints: alternative.autoPoints ?? question.autoPoints ?? null,
            manualPoints: alternative.manualPoints ?? question.manualPoints ?? null,
            forceMaxPoints: alternative.forceMaxPoints ?? question.forceMaxPoints,
            triesPerVariant: alternative.triesPerVariant ?? question.triesPerVariant,
            advanceScorePerc: alternative.advanceScorePerc,
            gradeRateMinutes: alternative.gradeRateMinutes ?? questionGradeRateMinutes,
            jsonGradeRateMinutes: alternative.gradeRateMinutes,
            canView: questionCanView,
            canSubmit: questionCanSubmit,
            comment: alternative.comment,
          };
        });
      } else if (question.id) {
        alternatives = [
          {
            qid: question.id,
            maxPoints: question.maxPoints ?? null,
            points: question.points ?? null,
            maxAutoPoints: question.maxAutoPoints ?? null,
            autoPoints: question.autoPoints ?? null,
            manualPoints: question.manualPoints ?? null,
            forceMaxPoints: question.forceMaxPoints,
            triesPerVariant: question.triesPerVariant,
            advanceScorePerc: question.advanceScorePerc,
            gradeRateMinutes: questionGradeRateMinutes,
            jsonGradeRateMinutes: question.gradeRateMinutes,
            canView: questionCanView,
            canSubmit: questionCanSubmit,
            // If a question has alternatives, the comment is stored on the alternative
            // group, since each alternative can have its own comment. If this is
            // just a single question with no alternatives, the comment is stored on
            // the assessment question itself.
            comment: question.alternatives ? undefined : question.comment,
          },
        ];
      }

      const normalizedAlternatives = alternatives.map((alternative) => {
        const hasSplitPoints =
          alternative.autoPoints != null ||
          alternative.maxAutoPoints != null ||
          alternative.manualPoints != null;
        const autoPoints = (hasSplitPoints ? alternative.autoPoints : alternative.points) ?? 0;
        const manualPoints = (hasSplitPoints ? alternative.manualPoints : 0) ?? 0;

        if (assessment.type === 'Exam') {
          const pointsList = Array.isArray(autoPoints) ? autoPoints : [autoPoints];
          const maxPoints = Math.max(...pointsList);

          return {
            ...alternative,
            hasSplitPoints,
            maxPoints,
            initPoints: undefined,
            pointsList: hasSplitPoints ? pointsList.map((p) => p + manualPoints) : pointsList,
          };
        } else if (assessment.type === 'Homework') {
          const initPoints =
            (Array.isArray(autoPoints) ? autoPoints[0] : autoPoints) + manualPoints;
          const maxPoints = alternative.maxAutoPoints ?? alternative.maxPoints ?? autoPoints;

          return {
            ...alternative,
            hasSplitPoints,
            maxPoints,
            initPoints,
            pointsList: undefined,
          };
        } else {
          assertNever(assessment.type);
        }
      });

      alternativeGroupNumber++;

      const questions = normalizedAlternatives.map((alternative, alternativeIndex) => {
        assessmentQuestionNumber++;
        const questionId = questionIds[alternative.qid];
        return {
          number: assessmentQuestionNumber,
          has_split_points: alternative.hasSplitPoints,
          points_list: alternative.pointsList,
          init_points: alternative.initPoints,
          max_points: alternative.maxPoints,
          manual_points: alternative.manualPoints,
          force_max_points: alternative.forceMaxPoints,
          tries_per_variant: alternative.triesPerVariant,
          grade_rate_minutes: alternative.gradeRateMinutes,
          json_grade_rate_minutes: alternative.jsonGradeRateMinutes,
          // This is the "resolved" setting. Although it's currently unused,
          // it'll be used at runtime once we add per-question configuration
          // of real-time grading. Soon we'll add per-zone and per-alternative-group
          // settings of this as well, and this will take that into account.
          allow_real_time_grading: assessment.allowRealTimeGrading ?? true,
          question_id: questionId,
          number_in_alternative_group: alternativeIndex + 1,
          can_view: alternative.canView,
          can_submit: alternative.canSubmit,
          advance_score_perc: alternative.advanceScorePerc,
          effective_advance_score_perc:
            alternative.advanceScorePerc ??
            question.advanceScorePerc ??
            zone.advanceScorePerc ??
            assessment.advanceScorePerc ??
            0,
          comment: alternative.comment,
        };
      });

      return {
        number: alternativeGroupNumber,
        number_choose: question.numberChoose ?? null,
        advance_score_perc: question.advanceScorePerc,
        json_grade_rate_minutes: question.gradeRateMinutes,
        json_can_view: question.canView,
        json_can_submit: question.canSubmit,
        json_has_alternatives: !!question.alternatives,
        questions,
        // If the question doesn't have any alternatives, we store the comment
        // on the assessment question itself, not the alternative group.
        comment: question.alternatives ? question.comment : undefined,
      };
    });
  });

  const groupRoles = assessment.groupRoles.map((role) => ({
    role_name: role.name,
    minimum: role.minimum,
    maximum: role.maximum,
    can_assign_roles: role.canAssignRoles,
  }));

  return {
    type: assessment.type,
    number: assessment.number,
    title: assessment.title,
    multiple_instance: assessment.multipleInstance,
    // If shuffleQuestions is not set, it's implicitly false for Homework and true for Exams.
    shuffle_questions:
      assessment.shuffleQuestions == null
        ? assessment.type === 'Exam'
        : assessment.shuffleQuestions,
    allow_issue_reporting: assessment.allowIssueReporting,
    allow_real_time_grading: assessment.allowRealTimeGrading ?? true,
    json_allow_real_time_grading: assessment.allowRealTimeGrading,
    allow_personal_notes: assessment.allowPersonalNotes,
    // If requireHonorCode is not set, it's implicitly false for Homework and true for Exams.
    // NOTE: There are various homeworks with requireHonorCode set to true in the database (see #12675 for more details)
    require_honor_code:
      assessment.requireHonorCode == null
        ? assessment.type === 'Exam'
        : assessment.requireHonorCode,
    honor_code: assessment.honorCode,
    auto_close: assessment.autoClose,
    max_points: assessment.maxPoints,
    max_bonus_points: assessment.maxBonusPoints,
    set_name: assessment.set,
    assessment_module_name: assessment.module,
    text: assessment.text,
    constant_question_value: assessment.constantQuestionValue,
    group_work: assessment.groupWork,
    group_max_size: assessment.groupMaxSize ?? null,
    group_min_size: assessment.groupMinSize ?? null,
    student_group_create: assessment.studentGroupCreate,
    student_group_choose_name: assessment.studentGroupChooseName,
    student_group_join: assessment.studentGroupJoin,
    student_group_leave: assessment.studentGroupLeave,
    advance_score_perc: assessment.advanceScorePerc,
    comment: assessment.comment,
    has_roles: assessment.groupRoles.length > 0,
    json_can_view: assessment.canView,
    json_can_submit: assessment.canSubmit,
    allowAccess,
    zones,
    alternativeGroups,
    groupRoles,
    grade_rate_minutes: assessment.gradeRateMinutes,
    // Needed when deleting unused alternative groups
    lastAlternativeGroupNumber: alternativeGroupNumber,
    share_source_publicly: assessment.shareSourcePublicly,
  };
}

function parseSharedQuestionReference(qid: string) {
  const firstSlash = qid.indexOf('/');
  if (firstSlash === -1) {
    // No QID, invalid question reference. An error will be recorded when trying to locate this question
    return {
      sharing_name: qid.slice(1),
      qid: '',
    };
  }

  return {
    sharing_name: qid.slice(1, firstSlash),
    qid: qid.slice(firstSlash + 1),
  };
}

/**
 * Determines if a course instance is accessible. A course instance is considered
 * to be accessible if any access rules either have no end date or have an end date
 * in the future.
 *
 * Note that this check is only approximate, as this doesn't take into account the
 * course instance's timezone. See implementation below for more details.
 */
function isCourseInstanceAccessible(courseInstanceData: CourseInstanceData) {
  const courseInstance = courseInstanceData.courseInstance.data;

  // If the course instance data is not available, treat it as though it's
  // not accessible.
  if (!courseInstance) return false;

  // If there are no access rules, the course instance is not accessible.
  if (courseInstance.allowAccess.length === 0) return false;

  return courseInstance.allowAccess.some(isAccessRuleAccessibleInFuture);
}

export async function sync(
  courseId: string,
  courseInstanceId: string,
  courseInstanceData: CourseInstanceData,
  questionIds: Record<string, any>,
) {
  const assessments = courseInstanceData.assessments;

  // We only check exam UUIDs if the course instance is accessible. This allows
  // us to delete the legacy `exams` table without producing sync warnings for
  // exam UUIDs corresponding to course instances that are no longer used.
  if (isCourseInstanceAccessible(courseInstanceData) && config.checkAccessRulesExamUuid) {
    // UUID-based exam access rules are validated here instead of course-db.js
    // because we need to hit the DB to check for them; we can't validate based
    // solely on the data we're reading off disk.
    // To be efficient, we'll collect all UUIDs from all assessments and check for
    // their existence in a single sproc call. We'll store a reverse mapping from UUID
    // to exams to be able to efficiently add warning information for missing UUIDs.
    const examUuids = new Set<string>();
    const uuidAssessmentMap = new Map<string, string[]>();
    Object.entries(assessments).forEach(([tid, assessment]) => {
      if (!assessment.data) return;
      assessment.data.allowAccess.forEach((allowAccess) => {
        const { examUuid } = allowAccess;
        if (examUuid) {
          examUuids.add(examUuid);
          let tids = uuidAssessmentMap.get(examUuid);
          if (!tids) {
            tids = [];
            uuidAssessmentMap.set(examUuid, tids);
          }
          tids.push(tid);
        }
      });
    });

    const uuidsRes = await sqldb.queryRows(
      sql.check_access_rules_exam_uuid,
      { exam_uuids: JSON.stringify([...examUuids]) },
      z.object({ uuid: z.string(), uuid_exists: z.boolean() }),
    );
    uuidsRes.forEach(({ uuid, uuid_exists }) => {
      if (!uuid_exists) {
        uuidAssessmentMap.get(uuid)?.forEach((tid) => {
          infofile.addWarning(
            assessments[tid],
            `examUuid "${uuid}" not found. Ensure you copied the correct UUID from PrairieTest.`,
          );
        });
      }
    });
  }

  const assessmentParams = Object.entries(assessments).map(([tid, assessment]) => {
    return JSON.stringify([
      tid,
      assessment.uuid,
      infofile.stringifyErrors(assessment),
      infofile.stringifyWarnings(assessment),
      getParamsForAssessment(assessment, questionIds),
    ]);
  });

  await sqldb.callRow(
    'sync_assessments',
    [assessmentParams, courseId, courseInstanceId, config.checkSharingOnSync],
    SprocSyncAssessmentsSchema,
  );
}

export async function validateAssessmentSharedQuestions(
  courseId: string,
  assessments: CourseInstanceData['assessments'],
  questionIds: Record<string, string>,
) {
  // A set of all imported question IDs.
  const importedQids = new Set<string>();

  // A mapping from assessment "TIDs" to a list of questions they import.
  const assessmentImportedQids = new Map<string, string[]>();

  Object.entries(assessments).forEach(([tid, assessment]) => {
    if (!assessment.data) return;
    assessment.data.zones.forEach((zone) => {
      zone.questions.forEach((question) => {
        const qids = question.alternatives?.map((alternative) => alternative.id) ?? [];
        if (question.id) {
          qids.push(question.id);
        }
        qids.forEach((qid) => {
          if (!qid.startsWith('@')) return;

          importedQids.add(qid);
          let qids = assessmentImportedQids.get(tid);
          if (!qids) {
            qids = [];
            assessmentImportedQids.set(tid, qids);
          }
          qids.push(qid);
        });
      });
    });
  });

  if (importedQids.size > 0) {
    const institutionId = await sqldb.queryRow(
      sql.get_institution_id,
      { course_id: courseId },
      z.string(),
    );
    const questionSharingEnabled = await features.enabled('question-sharing', {
      institution_id: institutionId,
      course_id: courseId,
    });
    const consumePublicQuestionsEnabled = await features.enabled('consume-public-questions', {
      institution_id: institutionId,
      course_id: courseId,
    });
    if (!(questionSharingEnabled || consumePublicQuestionsEnabled) && config.checkSharingOnSync) {
      for (const [tid, qids] of assessmentImportedQids.entries()) {
        if (qids.length > 0) {
          infofile.addError(
            assessments[tid],
            "You have attempted to import a question with '@', but question sharing is not enabled for your course.",
          );
        }
      }
    }

    const importedQuestions = await sqldb.queryRows(
      sql.get_imported_questions,
      {
        course_id: courseId,
        imported_question_info: JSON.stringify(
          Array.from(importedQids, parseSharedQuestionReference),
        ),
      },
      z.object({ sharing_name: z.string(), qid: z.string(), id: IdSchema }),
    );
    for (const row of importedQuestions) {
      questionIds['@' + row.sharing_name + '/' + row.qid] = row.id;
    }
    const missingQids = new Set(Array.from(importedQids).filter((qid) => !(qid in questionIds)));
    if (config.checkSharingOnSync) {
      for (const [tid, qids] of assessmentImportedQids.entries()) {
        const assessmentMissingQids = qids.filter((qid) => missingQids.has(qid));
        if (assessmentMissingQids.length > 0) {
          infofile.addError(
            assessments[tid],
            `For each of the following, either the course you are referencing does not exist, or the question does not exist within that course: ${[
              ...assessmentMissingQids,
            ].join(', ')}`,
          );
        }
      }
    }
  }
}
