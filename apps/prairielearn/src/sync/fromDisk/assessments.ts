import { isFuture, isValid, parseISO } from 'date-fns';
import _ = require('lodash');
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import * as infofile from '../infofile';
import { features } from '../../lib/features/index';
import { makePerformance } from '../performance';
import { Assessment, CourseInstanceData } from '../course-db';
import { IdSchema } from '../../lib/db-types';

const sql = sqldb.loadSqlEquiv(__filename);
const perf = makePerformance('assessments');

type AssessmentInfoFile = infofile.InfoFile<Assessment>;

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

  const allowIssueReporting = !!_.get(assessment, 'allowIssueReporting', true);
  const allowRealTimeGrading = !!_.get(assessment, 'allowRealTimeGrading', true);
  const requireHonorCode = !!_.get(assessment, 'requireHonorCode', true);

  // It used to be the case that assessment access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const allowAccess = (assessment.allowAccess ?? [])
    .filter((accessRule) => !_(accessRule).has('role') || accessRule.role === 'Student')
    .map((accessRule, index) => {
      return {
        number: index + 1,
        mode: _(accessRule).has('mode') ? accessRule.mode : null,
        uids: _(accessRule).has('uids') ? accessRule.uids : null,
        start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
        end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
        credit: _(accessRule).has('credit') ? accessRule.credit : null,
        time_limit_min: _(accessRule).has('timeLimitMin') ? accessRule.timeLimitMin : null,
        password: _(accessRule).has('password') ? accessRule.password : null,
        seb_config: _(accessRule).has('SEBConfig') ? accessRule.SEBConfig : null,
        exam_uuid: _(accessRule).has('examUuid') ? accessRule.examUuid : null,
        show_closed_assessment: !!_.get(accessRule, 'showClosedAssessment', true),
        show_closed_assessment_score: !!_.get(accessRule, 'showClosedAssessmentScore', true),
        active: !!_.get(accessRule, 'active', true),
      };
    });

  const zones = (assessment.zones ?? []).map((zone, index) => {
    return {
      number: index + 1,
      title: zone.title,
      number_choose: zone.numberChoose,
      max_points: zone.maxPoints,
      best_questions: zone.bestQuestions,
      advance_score_perc: zone.advanceScorePerc,
    };
  });

  let alternativeGroupNumber = 0;
  let assessmentQuestionNumber = 0;
  const allRoleNames = (assessment.groupRoles ?? []).map((role) => role.name);
  const assessmentCanView = assessment?.canView ?? allRoleNames;
  const assessmentCanSubmit = assessment?.canSubmit ?? allRoleNames;
  const alternativeGroups = (assessment.zones ?? []).map((zone) => {
    const zoneGradeRateMinutes = _.has(zone, 'gradeRateMinutes')
      ? zone.gradeRateMinutes
      : assessment.gradeRateMinutes || 0;
    const zoneCanView = zone?.canView ?? assessmentCanView;
    const zoneCanSubmit = zone?.canSubmit ?? assessmentCanSubmit;
    return zone.questions.map((question) => {
      let alternatives: {
        qid: string;
        maxPoints: number | number[];
        points: number | number[];
        maxAutoPoints: number | number[];
        autoPoints: number | number[];
        manualPoints: number;
        forceMaxPoints: boolean;
        triesPerVariant: number;
        gradeRateMinutes: number;
        canView: string[] | null;
        canSubmit: string[] | null;
        advanceScorePerc: number;
      }[] = [];
      const questionGradeRateMinutes = _.has(question, 'gradeRateMinutes')
        ? question.gradeRateMinutes
        : zoneGradeRateMinutes;
      const questionCanView = question.canView ?? zoneCanView;
      const questionCanSubmit = question.canSubmit ?? zoneCanSubmit;
      if (question.alternatives) {
        alternatives = _.map(question.alternatives, function (alternative) {
          return {
            qid: alternative.id,
            maxPoints: alternative.maxPoints ?? question.maxPoints ?? null,
            points: alternative.points ?? question.points ?? null,
            maxAutoPoints: alternative.maxAutoPoints ?? question.maxAutoPoints ?? null,
            autoPoints: alternative.autoPoints ?? question.autoPoints ?? null,
            manualPoints: alternative.manualPoints ?? question.manualPoints ?? null,
            forceMaxPoints: _.has(alternative, 'forceMaxPoints')
              ? alternative.forceMaxPoints
              : _.has(question, 'forceMaxPoints')
                ? question.forceMaxPoints
                : false,
            triesPerVariant: _.has(alternative, 'triesPerVariant')
              ? alternative.triesPerVariant
              : _.has(question, 'triesPerVariant')
                ? question.triesPerVariant
                : 1,
            advanceScorePerc: alternative.advanceScorePerc,
            gradeRateMinutes: _.has(alternative, 'gradeRateMinutes')
              ? alternative.gradeRateMinutes
              : questionGradeRateMinutes,
            canView: alternative?.canView ?? questionCanView,
            canSubmit: alternative?.canSubmit ?? questionCanSubmit,
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
            forceMaxPoints: question.forceMaxPoints || false,
            triesPerVariant: question.triesPerVariant || 1,
            advanceScorePerc: question.advanceScorePerc,
            gradeRateMinutes: questionGradeRateMinutes,
            canView: questionCanView,
            canSubmit: questionCanSubmit,
          },
        ];
      }

      const normalizedAlternatives = alternatives.map((alternative) => {
        const hasSplitPoints =
          alternative.autoPoints !== null ||
          alternative.maxAutoPoints !== null ||
          alternative.manualPoints !== null;
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
          throw new Error(`Unknown assessment type: ${assessment.type}`);
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
        };
      });

      return {
        number: alternativeGroupNumber,
        number_choose: question.numberChoose,
        advance_score_perc: question.advanceScorePerc,
        questions,
      };
    });
  });

  const groupRoles = (assessment.groupRoles ?? []).map((role) => ({
    role_name: role.name,
    minimum: role.minimum,
    maximum: role.maximum,
    can_assign_roles: role.canAssignRoles,
  }));

  return {
    type: assessment.type,
    number: assessment.number,
    title: assessment.title,
    multiple_instance: assessment.multipleInstance ? true : false,
    shuffle_questions:
      (assessment.type === 'Exam' && assessment.shuffleQuestions === undefined) ||
      assessment.shuffleQuestions
        ? true
        : false,
    allow_issue_reporting: allowIssueReporting,
    allow_real_time_grading: allowRealTimeGrading,
    require_honor_code: requireHonorCode,
    auto_close: !!_.get(assessment, 'autoClose', true),
    max_points: assessment.maxPoints,
    max_bonus_points: assessment.maxBonusPoints,
    set_name: assessment.set,
    assessment_module_name: assessment.module,
    text: assessment.text,
    constant_question_value: !!_.get(assessment, 'constantQuestionValue', false),
    group_work: !!assessment.groupWork,
    group_max_size: assessment.groupMaxSize || null,
    group_min_size: assessment.groupMinSize || null,
    student_group_create: !!assessment.studentGroupCreate,
    student_group_join: !!assessment.studentGroupJoin,
    student_group_leave: !!assessment.studentGroupLeave,
    advance_score_perc: assessment.advanceScorePerc,
    has_roles: !!assessment.groupRoles,
    allowAccess,
    zones,
    alternativeGroups,
    groupRoles,
    // Needed when deleting unused alternative groups
    lastAlternativeGroupNumber: alternativeGroupNumber,
  };
}

function parseSharedQuestionReference(qid) {
  const firstSlash = qid.indexOf('/');
  if (firstSlash === -1) {
    // No QID, invalid question reference. An error will be recorded when trying to locate this question
    return {
      sharing_name: qid.substring(1, qid.length),
      qid: '',
    };
  }

  return {
    sharing_name: qid.substring(1, firstSlash),
    qid: qid.substring(firstSlash + 1, qid.length),
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
  if (!courseInstance.allowAccess?.length) return false;

  return courseInstance.allowAccess.some((accessRule) => {
    if (!accessRule.endDate) return true;

    // We don't have easy access to the course instance's timezone, so we'll
    // just parse it in the machine's local timezone. This is fine, as we're
    // only interesting in a rough signal of whether the end date is in the
    // future. If we're off by up to a day, it's not a big deal.
    //
    // If the date is invalid, we'll treat it as though it's in the past and
    // thus that it does not make the course instance accessible.
    //
    // `parseISO` is used instead of `new Date` for consistency with `course-db.ts`.
    const parsedDate = parseISO(accessRule.endDate);
    if (!isValid(parsedDate)) return false;
    return isFuture(parsedDate);
  });
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
      (assessment.data.allowAccess || []).forEach((allowAccess) => {
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

  // A set of all imported question IDs.
  const importedQids = new Set<string>();

  // A mapping from assessment "TIDs" to a list of questions they import.
  const assessmentImportedQids = new Map<string, string[]>();

  Object.entries(assessments).forEach(([tid, assessment]) => {
    if (!assessment.data) return;
    (assessment.data.zones || []).forEach((zone) => {
      (zone.questions || []).forEach((question) => {
        const qids = question.alternatives?.map((alternative) => alternative.id) ?? [];
        if (question.id) {
          qids.push(question.id);
        }
        qids.forEach((qid) => {
          if (qid[0] !== '@') return;

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
      course_id: courseId,
      course_instance_id: courseInstanceId,
      institution_id: institutionId,
    });
    if (!questionSharingEnabled && config.checkSharingOnSync) {
      for (const [tid, qids] of assessmentImportedQids.entries()) {
        if (qids.length > 0) {
          infofile.addError(
            assessments[tid],
            `You have attempted to import a question with '@', but question sharing is not enabled for your course.`,
          );
        }
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

  const assessmentParams = Object.entries(assessments).map(([tid, assessment]) => {
    return JSON.stringify([
      tid,
      assessment.uuid,
      infofile.stringifyErrors(assessment),
      infofile.stringifyWarnings(assessment),
      getParamsForAssessment(assessment, questionIds),
    ]);
  });

  perf.start('sproc:sync_assessments');
  await sqldb.callOneRowAsync('sync_assessments', [
    assessmentParams,
    courseId,
    courseInstanceId,
    config.checkSharingOnSync,
  ]);
  perf.end('sproc:sync_assessments');
}
