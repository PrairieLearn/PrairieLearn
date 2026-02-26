import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { QuestionAlternativeForm, ZoneQuestionBlockForm } from '../types.js';

export function validatePositiveInteger(value: number | undefined, fieldName: string) {
  if (value !== undefined && value < 1) {
    return `${fieldName} must be at least 1.`;
  }
  if (value !== undefined && !Number.isInteger(value)) {
    return `${fieldName} must be an integer.`;
  }
}

/**
 * Normalizes point fields based on whether manualPoints is set.
 * When manualPoints is defined or both points/autoPoints exist, we convert
 * to autoPoints/maxAutoPoints format (clearing points/maxPoints).
 */
export function normalizeQuestionPoints<T extends ZoneQuestionBlockForm | QuestionAlternativeForm>(
  question: T,
): T {
  const normalized = { ...question };

  const hasManualPoints = normalized.manualPoints !== undefined;
  const hasBothPointTypes = normalized.points !== undefined && normalized.autoPoints !== undefined;

  if (hasManualPoints || hasBothPointTypes) {
    // Convert points to autoPoints if needed
    if (normalized.points !== undefined) {
      normalized.autoPoints = normalized.points;
      normalized.points = undefined;
    }
    // Convert maxPoints to maxAutoPoints if needed
    if (normalized.maxPoints !== undefined) {
      normalized.maxAutoPoints = normalized.maxPoints;
      normalized.maxPoints = undefined;
    }
  }

  return normalized;
}

export function questionDisplayName(course: StaffCourse, question: StaffAssessmentQuestionRow) {
  if (!question.question.qid) throw new Error('Question QID is required');
  if (course.id === question.question.course_id) {
    return question.question.qid;
  }
  if (!question.course.sharing_name) throw new Error('Sharing name is required');
  return `@${question.course.sharing_name}/${question.question.qid}`;
}

/**
 * Maps questions to a `zone` tree that matches the JSON structure.
 *
 * It assumes that question rows are sorted according to their final JSON structure
 * (e.g. via `selectAssessmentQuestions`).
 */
export function buildHierarchicalAssessment(
  course: StaffCourse,
  rows: StaffAssessmentQuestionRow[],
): ZoneAssessmentJson[] {
  const zones: ZoneAssessmentJson[] = [];
  const zoneAlternativeGroupCounts: Record<number, number> = {};

  for (const row of rows) {
    zones[row.zone.number - 1] ??= {
      title: row.zone.title ?? undefined,
      comment: row.zone.json_comment ?? undefined,
      maxPoints: row.zone.max_points ?? undefined,
      numberChoose: row.zone.number_choose ?? undefined,
      bestQuestions: row.zone.best_questions ?? undefined,
      lockpoint: row.zone.lockpoint,
      questions: [],
      advanceScorePerc: row.zone.advance_score_perc ?? undefined,
      gradeRateMinutes: row.zone.json_grade_rate_minutes ?? undefined,
      canView: row.zone.json_can_view ?? [],
      canSubmit: row.zone.json_can_submit ?? [],
    };

    const zoneNumber = row.zone.number;
    zoneAlternativeGroupCounts[zoneNumber] ??= -1;

    // If this is a new alternative group in this zone, increment the count
    if (row.start_new_alternative_group) {
      zoneAlternativeGroupCounts[zoneNumber]++;
    }

    // Use the count as the position within the zone
    const positionInZone = zoneAlternativeGroupCounts[zoneNumber];
    if (!zones[zoneNumber - 1].questions[positionInZone]) {
      zones[zoneNumber - 1].questions[positionInZone] ??= {
        comment: row.alternative_group.json_comment ?? undefined,
        advanceScorePerc: row.alternative_group.advance_score_perc ?? undefined,
        canView: row.alternative_group.json_can_view ?? [],
        canSubmit: row.alternative_group.json_can_submit ?? [],
        gradeRateMinutes: row.alternative_group.json_grade_rate_minutes ?? undefined,
        numberChoose: row.alternative_group.number_choose ?? undefined,
        triesPerVariant: row.alternative_group.json_tries_per_variant ?? undefined,
        points: row.alternative_group.json_points ?? undefined,
        autoPoints: row.alternative_group.json_auto_points ?? undefined,
        maxPoints: row.alternative_group.json_max_points ?? undefined,
        maxAutoPoints: row.alternative_group.json_max_auto_points ?? undefined,
        manualPoints: row.alternative_group.json_manual_points ?? undefined,
        forceMaxPoints: row.alternative_group.json_force_max_points ?? undefined,
      };
    }

    if (row.alternative_group.json_has_alternatives) {
      if (row.assessment_question.number_in_alternative_group == null) {
        throw new Error('Assessment question number is required');
      }

      zones[zoneNumber - 1].questions[positionInZone].alternatives ??= [];
      zones[zoneNumber - 1].questions[positionInZone].alternatives![
        row.assessment_question.number_in_alternative_group - 1
      ] = {
        comment: row.assessment_question.json_comment ?? undefined,
        id: questionDisplayName(course, row),
        forceMaxPoints: row.assessment_question.json_force_max_points ?? undefined,
        triesPerVariant: row.assessment_question.json_tries_per_variant ?? undefined,
        advanceScorePerc: row.assessment_question.advance_score_perc ?? undefined,
        gradeRateMinutes: row.assessment_question.json_grade_rate_minutes ?? undefined,
        allowRealTimeGrading: row.assessment_question.json_allow_real_time_grading ?? undefined,
        points: row.assessment_question.json_points ?? undefined,
        autoPoints: row.assessment_question.json_auto_points ?? undefined,
        maxPoints: row.assessment_question.json_max_points ?? undefined,
        maxAutoPoints: row.assessment_question.json_max_auto_points ?? undefined,
        manualPoints: row.assessment_question.json_manual_points ?? undefined,
      };
    } else {
      // Set the top level question ID if there are no alternatives
      zones[zoneNumber - 1].questions[positionInZone].id = questionDisplayName(course, row);
    }
  }
  return zones;
}
