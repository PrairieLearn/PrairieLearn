import {
  type OtherAssessment,
  type StaffAssessmentQuestionRow,
  StaffAssessmentQuestionRowSchema,
} from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
  StaffTag,
} from '../../../lib/client/safe-db-types.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type { QuestionPointsJson, ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { QuestionByQidResult } from '../trpc.js';
import type {
  AssessmentForPicker,
  CourseQuestionForPicker,
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

/**
 * Compresses an array of points by collapsing consecutive runs.
 * e.g. [10, 10, 10, 5, 5] → "10×3, 5, 5"
 *      [10, 5, 3] → "10, 5, 3"
 *      [10] → "10"
 */
export function compactPoints(pts: number[]): string {
  if (pts.length <= 1) return pts.join(', ');

  const runs: { value: number; count: number }[] = [];
  for (const p of pts) {
    const last = runs.at(-1);
    if (last?.value === p) {
      last.count++;
    } else {
      runs.push({ value: p, count: 1 });
    }
  }

  return runs
    .flatMap((r) =>
      r.count > 2
        ? [`${r.value}×${r.count}`]
        : Array.from<string>({ length: r.count }).fill(`${r.value}`),
    )
    .join(', ');
}

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

function firstPoints(value: number | number[] | null | undefined): number {
  if (value == null) return 0;
  return Array.isArray(value) ? (value[0] ?? 0) : value;
}

export function computeZoneQuestionCount(questions: ZoneQuestionBlockForm[]): number {
  let count = 0;
  for (const q of questions) {
    if (q.alternatives) {
      count += Math.min(q.numberChoose ?? q.alternatives.length, q.alternatives.length);
    } else {
      count += 1;
    }
  }
  return count;
}

export function computeZonePointTotals(
  questions: ZoneQuestionBlockForm[],
  opts?: { bestQuestions?: number; numberChoose?: number },
): {
  autoPoints: number;
  manualPoints: number;
} {
  // Compute per-block point contributions.
  // For Homework questions with max-point caps (maxAutoPoints/maxPoints),
  // the cap represents the maximum achievable score and should be used
  // instead of the initial autoPoints value.
  const blockPoints = questions.map((q) => {
    if (q.alternatives) {
      // Resolve each alternative's effective points (alternative-level ?? group-level)
      const resolved = q.alternatives.map((alt) => ({
        auto: firstPoints(
          alt.maxAutoPoints ??
            alt.maxPoints ??
            q.maxAutoPoints ??
            q.maxPoints ??
            alt.points ??
            alt.autoPoints ??
            q.points ??
            q.autoPoints,
        ),
        manual: alt.manualPoints ?? q.manualPoints ?? 0,
      }));
      // Sort by total descending and take the best numberChoose alternatives
      resolved.sort((a, b) => b.auto + b.manual - (a.auto + a.manual));
      const count = Math.min(q.numberChoose ?? resolved.length, resolved.length);
      const selected = resolved.slice(0, count);
      return {
        auto: selected.reduce((sum, r) => sum + r.auto, 0),
        manual: selected.reduce((sum, r) => sum + r.manual, 0),
      };
    }
    return {
      auto: firstPoints(q.maxAutoPoints ?? q.maxPoints ?? q.points ?? q.autoPoints),
      manual: q.manualPoints ?? 0,
    };
  });

  // If the zone uses bestQuestions or numberChoose, only the best N blocks count.
  const zoneChoose = opts?.bestQuestions ?? opts?.numberChoose;
  if (zoneChoose != null && zoneChoose < blockPoints.length) {
    blockPoints.sort((a, b) => b.auto + b.manual - (a.auto + a.manual));
    blockPoints.length = zoneChoose;
  }

  return {
    autoPoints: blockPoints.reduce((sum, b) => sum + b.auto, 0),
    manualPoints: blockPoints.reduce((sum, b) => sum + b.manual, 0),
  };
}

/**
 * Computes the maximum total points for a question, resolving inheritance
 * from the parent alt group when applicable.
 */
export function computeQuestionTotalPoints(
  question: QuestionPointsJson,
  assessmentType: EnumAssessmentType,
  parent?: QuestionPointsJson,
): number {
  const points = question.points ?? parent?.points;
  const autoPoints = question.autoPoints ?? parent?.autoPoints;
  const maxAutoPoints = question.maxAutoPoints ?? parent?.maxAutoPoints;
  const maxPoints = question.maxPoints ?? parent?.maxPoints;
  const manualPoints = question.manualPoints ?? parent?.manualPoints ?? 0;

  if (assessmentType === 'Homework') {
    const auto = maxAutoPoints ?? maxPoints ?? autoPoints ?? points ?? 0;
    return firstPoints(auto) + firstPoints(manualPoints);
  }

  // Exam: first element of points array is the max
  const auto = points ?? autoPoints ?? 0;
  return firstPoints(auto) + firstPoints(manualPoints);
}

/**
 * Returns true if alternatives within an alt group have different total point values.
 */
export function hasPointsMismatch(
  alternatives: QuestionAlternativeForm[],
  assessmentType: EnumAssessmentType,
  parent?: QuestionPointsJson,
): boolean {
  if (alternatives.length <= 1) return false;

  const totals = alternatives.map((alt) => computeQuestionTotalPoints(alt, assessmentType, parent));
  return totals.some((t) => t !== totals[0]);
}

/**
 * Returns true if question blocks in a zone with bestQuestions or numberChoose
 * have different contributed total point values.
 */
export function hasZonePointsMismatch(
  zone: ZoneAssessmentForm,
  assessmentType: EnumAssessmentType,
): boolean {
  if (zone.bestQuestions == null && zone.numberChoose == null) return false;
  if (zone.questions.length <= 1) return false;

  const blockTotals = zone.questions.map((block) => {
    if (block.alternatives) {
      const altTotals = block.alternatives
        .map((alt) => computeQuestionTotalPoints(alt, assessmentType, block))
        .sort((a, b) => b - a);
      const count = Math.min(block.numberChoose ?? altTotals.length, altTotals.length);
      return altTotals.slice(0, count).reduce((sum, t) => sum + t, 0);
    }
    return computeQuestionTotalPoints(block, assessmentType);
  });

  return blockTotals.some((t) => t !== blockTotals[0]);
}

export function toAssessmentForPicker(assessments: OtherAssessment[]): AssessmentForPicker[] {
  return assessments.map((a) => ({
    assessment_id: String(a.assessment_id),
    label: `${a.assessment_set_abbreviation}${a.assessment_number}`,
    color: a.assessment_set_color,
    assessment_set_abbreviation: a.assessment_set_abbreviation,
    assessment_set_name: a.assessment_set_name,
    assessment_set_color: a.assessment_set_color,
    assessment_number: a.assessment_number,
  }));
}

export function buildQuestionMetadata(opts: {
  data: QuestionByQidResult;
  assessment: StaffAssessment;
  courseInstance: StaffCourseInstance;
  course: StaffCourse;
  courseQuestions?: CourseQuestionForPicker[];
}): StaffAssessmentQuestionRow {
  const { data, assessment, courseInstance, course, courseQuestions } = opts;

  const otherAssessments: OtherAssessment[] | null = (() => {
    if (!courseQuestions) return null;
    const courseQuestion = courseQuestions.find((q) => q.qid === data.question.qid);
    if (!courseQuestion?.assessments?.length) return null;
    const filtered = courseQuestion.assessments
      .filter((a) => a.assessment_id !== assessment.id)
      .map(
        (a): OtherAssessment => ({
          assessment_id: a.assessment_id,
          assessment_set_abbreviation: a.assessment_set_abbreviation ?? '',
          assessment_set_name: a.assessment_set_name ?? '',
          assessment_number: a.assessment_number ?? '',
          assessment_set_color: a.assessment_set_color ?? '',
          assessment_course_instance_id: courseInstance.id,
          assessment_share_source_publicly: false,
        }),
      );
    return filtered.length > 0 ? filtered : null;
  })();

  return StaffAssessmentQuestionRowSchema.parse({
    zone: {
      id: '0',
      assessment_id: assessment.id,
      number: 0,
      title: null,
      max_points: null,
      best_questions: null,
      number_choose: null,
      advance_score_perc: null,
      lockpoint: false,
      json_allow_real_time_grading: null,
      json_can_submit: null,
      json_can_view: null,
      json_comment: null,
      json_grade_rate_minutes: null,
    },
    course_instance: courseInstance,
    course,
    question: data.question,
    topic: data.topic,
    open_issue_count: data.open_issue_count,
    tags: data.tags,
    other_assessments: otherAssessments,
    assessment,
    assessment_question: {
      id: '0',
      question_id: data.question.id,
      assessment_id: assessment.id,
      ai_grading_mode: false,
      allow_real_time_grading: true,
      alternative_group_id: null,
      advance_score_perc: null,
      average_average_submission_score: null,
      average_first_submission_score: null,
      average_last_submission_score: null,
      average_max_submission_score: null,
      average_number_submissions: null,
      average_submission_score_hist: null,
      average_submission_score_variance: null,
      deleted_at: null,
      discrimination: null,
      effective_advance_score_perc: 0,
      first_submission_score_hist: null,
      first_submission_score_variance: null,
      force_max_points: null,
      grade_rate_minutes: null,
      incremental_submission_points_array_averages: null,
      incremental_submission_points_array_variances: null,
      incremental_submission_score_array_averages: null,
      incremental_submission_score_array_variances: null,
      init_points: null,
      json_allow_real_time_grading: null,
      json_auto_points: null,
      json_comment: null,
      json_force_max_points: null,
      json_grade_rate_minutes: null,
      json_manual_points: null,
      json_max_auto_points: null,
      json_max_points: null,
      json_points: null,
      json_tries_per_variant: null,
      last_submission_score_hist: null,
      last_submission_score_variance: null,
      manual_rubric_id: null,
      max_auto_points: null,
      max_manual_points: null,
      max_points: null,
      max_submission_score_hist: null,
      max_submission_score_variance: null,
      mean_question_score: null,
      median_question_score: null,
      number: 0,
      number_in_alternative_group: null,
      number_submissions_hist: null,
      number_submissions_variance: null,
      points_list: null,
      question_score_variance: null,
      quintile_question_scores: null,
      some_nonzero_submission_perc: null,
      some_perfect_submission_perc: null,
      some_submission_perc: null,
      submission_score_array_averages: null,
      submission_score_array_variances: null,
      tries_per_variant: null,
    },
    alternative_group: {
      id: '0',
      assessment_id: assessment.id,
      number: 0,
      zone_id: '0',
      advance_score_perc: null,
      json_allow_real_time_grading: null,
      json_auto_points: null,
      json_can_submit: null,
      json_can_view: null,
      json_comment: null,
      json_force_max_points: null,
      json_grade_rate_minutes: null,
      json_has_alternatives: null,
      json_manual_points: null,
      json_max_auto_points: null,
      json_max_points: null,
      json_points: null,
      json_tries_per_variant: null,
      number_choose: null,
    },
    start_new_zone: false,
    start_new_alternative_group: true,
    alternative_group_size: 1,
  });
}

/**
 * Computes the set of tags shared across all alternatives in an alt group.
 * Returns the tag objects from the first alternative that has tags.
 */
export function getSharedTags(
  alternatives: { id: string }[],
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>,
): StaffTag[] {
  const tagSets = alternatives
    .filter((alt) => alt.id && questionMetadata[alt.id]?.tags)
    .map((alt) => new Set(questionMetadata[alt.id]!.tags!.map((t) => t.name)));
  if (tagSets.length === 0) return [];
  const intersection = new Set(tagSets[0]);
  for (const s of tagSets.slice(1)) {
    for (const name of intersection) {
      if (!s.has(name)) intersection.delete(name);
    }
  }
  if (intersection.size === 0) return [];
  const firstTaggedAlt = alternatives.find((a) => a.id && questionMetadata[a.id]?.tags?.length);
  if (!firstTaggedAlt) return [];
  const firstTags = questionMetadata[firstTaggedAlt.id]!.tags!;
  return firstTags.filter((t) => intersection.has(t.name));
}
