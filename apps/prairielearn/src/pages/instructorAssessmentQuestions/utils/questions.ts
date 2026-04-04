import {
  type EditorQuestionMetadata,
  type OtherAssessment,
  type StaffAssessmentQuestionRow,
} from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
  StaffTag,
  StaffTopic,
} from '../../../lib/client/safe-db-types.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import {
  type EnumAssessmentTool,
  EnumAssessmentToolSchema,
  type QuestionPointsJson,
  type ZoneAssessmentJson,
} from '../../../schemas/infoAssessment.js';
import type { QuestionByQidResult } from '../../../trpc/assessment/assessment-questions.js';
import type {
  AssessmentForPicker,
  CourseQuestionForPicker,
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

export type QuestionMetadataMap = Partial<Record<string, EditorQuestionMetadata>>;

/**
 * Whether the question has a non-empty, non-whitespace title.
 * When false, callers should display the QID instead.
 */
export function questionHasTitle(questionData: EditorQuestionMetadata | null): boolean {
  return (questionData?.question.title?.trim().length ?? 0) > 0;
}

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

export function questionDisplayName(
  course: StaffCourse,
  row: Pick<EditorQuestionMetadata, 'question' | 'course'>,
) {
  if (!row.question.qid) throw new Error('Question QID is required');
  if (course.id === row.question.course_id) {
    return row.question.qid;
  }
  if (!row.course.sharing_name) throw new Error('Sharing name is required');
  return `@${row.course.sharing_name}/${row.question.qid}`;
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
  const zoneAlternativePoolCounts: Record<number, number> = {};

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
      allowRealTimeGrading: row.zone.json_allow_real_time_grading ?? undefined,
      canView: row.zone.json_can_view ?? [],
      canSubmit: row.zone.json_can_submit ?? [],
    };

    const zoneNumber = row.zone.number;
    zoneAlternativePoolCounts[zoneNumber] ??= -1;

    // If this is a new alternative pool in this zone, increment the count
    if (row.start_new_alternative_pool) {
      zoneAlternativePoolCounts[zoneNumber]++;
    }

    // Use the count as the position within the zone
    const positionInZone = zoneAlternativePoolCounts[zoneNumber];
    if (!zones[zoneNumber - 1].questions[positionInZone]) {
      zones[zoneNumber - 1].questions[positionInZone] ??= {
        comment: row.alternative_pool.json_comment ?? undefined,
        advanceScorePerc: row.alternative_pool.advance_score_perc ?? undefined,
        canView: row.alternative_pool.json_can_view ?? [],
        canSubmit: row.alternative_pool.json_can_submit ?? [],
        gradeRateMinutes: row.alternative_pool.json_grade_rate_minutes ?? undefined,
        allowRealTimeGrading: row.alternative_pool.json_allow_real_time_grading ?? undefined,
        numberChoose: row.alternative_pool.number_choose ?? undefined,
        triesPerVariant: row.alternative_pool.json_tries_per_variant ?? undefined,
        points: row.alternative_pool.json_points ?? undefined,
        autoPoints: row.alternative_pool.json_auto_points ?? undefined,
        maxPoints: row.alternative_pool.json_max_points ?? undefined,
        maxAutoPoints: row.alternative_pool.json_max_auto_points ?? undefined,
        manualPoints: row.alternative_pool.json_manual_points ?? undefined,
        forceMaxPoints: row.alternative_pool.json_force_max_points ?? undefined,
      };
    }

    if (row.alternative_pool.json_has_alternatives) {
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
        preferences: row.assessment_question.preferences ?? undefined,
      };
    } else {
      // Set the top level question ID if there are no alternatives
      zones[zoneNumber - 1].questions[positionInZone].id = questionDisplayName(course, row);
      zones[zoneNumber - 1].questions[positionInZone].comment =
        row.assessment_question.json_comment ?? undefined;
      zones[zoneNumber - 1].questions[positionInZone].preferences =
        row.assessment_question.preferences ?? undefined;
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
      // Resolve each alternative's effective points (alternative-level ?? pool-level)
      const resolved = q.alternatives.map((alt) => ({
        auto: firstPoints(
          alt.maxAutoPoints ??
            alt.maxPoints ??
            q.maxAutoPoints ??
            q.maxPoints ??
            alt.autoPoints ??
            alt.points ??
            q.autoPoints ??
            q.points,
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
      auto: firstPoints(q.maxAutoPoints ?? q.maxPoints ?? q.autoPoints ?? q.points),
      manual: q.manualPoints ?? 0,
    };
  });

  // If the zone uses bestQuestions or numberChoose, only the best N blocks count.
  // When both are set, the effective limit is the smaller of the two.
  const zoneChoose =
    opts?.bestQuestions != null && opts.numberChoose != null
      ? Math.min(opts.bestQuestions, opts.numberChoose)
      : (opts?.bestQuestions ?? opts?.numberChoose);
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
 * from the parent alt pool when applicable.
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
 * Returns true if alternatives within an alt pool have different total point values.
 */
export function hasPointsMismatch(
  alternatives: QuestionAlternativeForm[],
  assessmentType: EnumAssessmentType,
  parent?: QuestionPointsJson & { numberChoose?: number | null },
): boolean {
  if (alternatives.length <= 1) return false;
  // When all alternatives are selected, different point values don't cause
  // inconsistency — every student gets the same total. The assessment instance
  // creation process selects all alternatives when number_choose is NULL.
  const effectiveChoose = parent?.numberChoose ?? alternatives.length;
  if (effectiveChoose >= alternatives.length) return false;

  const totals = alternatives.map((alt) => computeQuestionTotalPoints(alt, assessmentType, parent));
  return totals.some((t) => t !== totals[0]);
}

type ZonePointsMismatchKind = 'numberChoose' | 'bestQuestions' | 'both';

const ZONE_POINTS_MISMATCH_TEXT: Record<ZonePointsMismatchKind, { label: string; body: string }> = {
  numberChoose: {
    label: 'Inconsistent points',
    body: 'Students will receive different total points because this zone randomly selects questions with different point values.',
  },
  bestQuestions: {
    label: 'Inconsistent points',
    body: 'Students will receive different total points because only the best-scoring questions count and questions have different point values.',
  },
  both: {
    label: 'Inconsistent points',
    body: 'Students will receive different total points because this zone randomly selects questions and only counts the best-scoring ones, and questions have different point values.',
  },
};

/**
 * Returns label and body text describing why question blocks in a zone have
 * inconsistent point values, or null if there is no mismatch.
 */
export function getZonePointsMismatch(
  zone: ZoneAssessmentForm,
  assessmentType: EnumAssessmentType,
): { label: string; body: string } | null {
  if (zone.bestQuestions == null && zone.numberChoose == null) return null;
  if (zone.questions.length <= 1) return null;
  // When all questions are both presented and counted, every student sees the
  // same total regardless of individual point values — no warning needed.
  const effectiveChoose = zone.numberChoose ?? zone.questions.length;
  const effectiveBest = zone.bestQuestions ?? effectiveChoose;
  if (effectiveChoose >= zone.questions.length && effectiveBest >= effectiveChoose) {
    return null;
  }

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

  if (!blockTotals.some((t) => t !== blockTotals[0])) return null;

  const hasNumberChoose = zone.numberChoose != null && zone.numberChoose < zone.questions.length;
  const hasBestQuestions = zone.bestQuestions != null && zone.bestQuestions < effectiveChoose;

  const kind: ZonePointsMismatchKind =
    hasNumberChoose && hasBestQuestions
      ? 'both'
      : hasBestQuestions
        ? 'bestQuestions'
        : 'numberChoose';
  return ZONE_POINTS_MISMATCH_TEXT[kind];
}

/**
 * Returns true if a zone's numberChoose or bestQuestions exceeds the number of questions.
 */
export function hasZoneChooseExceedsCount(zone: ZoneAssessmentForm): boolean {
  const count = computeZoneQuestionCount(zone.questions);
  if (count === 0) return false;
  if (zone.numberChoose != null && zone.numberChoose > count) return true;
  if (zone.bestQuestions != null && zone.bestQuestions > count) return true;
  if (
    zone.bestQuestions != null &&
    zone.numberChoose != null &&
    zone.bestQuestions > zone.numberChoose
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true if an alt pool's numberChoose exceeds the number of alternatives.
 */
export function hasAltPoolChooseExceedsCount(block: ZoneQuestionBlockForm): boolean {
  if (block.numberChoose == null || block.alternatives == null) return false;
  return block.numberChoose > block.alternatives.length;
}

/**
 * Computes the [min, max] range of questions chosen from a specific alt pool,
 * based on the zone's spreading algorithm (mirrors `z_numbered_assessment_questions`
 * in `assessment.sql`).
 *
 * Think of it like dealing cards in rounds: round 1 deals one question to each
 * block, round 2 deals a second to blocks large enough, etc. The zone's
 * `numberChoose` is the total number of cards dealt.
 */
export function computeAltPoolChosenRange(
  zone: ZoneAssessmentForm,
  targetBlock: ZoneQuestionBlockForm,
): { min: number; max: number } {
  // Compute the effective size of each block (how many questions it contributes).
  const blockSizes = zone.questions.map((block) => {
    if (block.alternatives) {
      return Math.min(block.numberChoose ?? block.alternatives.length, block.alternatives.length);
    }
    return 1;
  });

  const targetIdx = zone.questions.indexOf(targetBlock);
  const targetSize = blockSizes[targetIdx];

  // If zone.numberChoose is null (select all), every block contributes its full effective size.
  if (zone.numberChoose == null) {
    return { min: targetSize, max: targetSize };
  }

  const budget = zone.numberChoose;

  // Build rounds: round k (1-indexed) has one question from each block with size >= k.
  // questionsDealtByRound[k] = cumulative questions dealt through round k.
  const maxRound = Math.max(...blockSizes, 0);
  const questionsDealtByRound: number[] = [0];
  for (let k = 1; k <= maxRound; k++) {
    const blocksInRound = blockSizes.filter((s) => s >= k).length;
    questionsDealtByRound[k] = questionsDealtByRound[k - 1] + blocksInRound;
  }

  // How many full rounds is the target guaranteed to participate in?
  // That's the last round k (up to targetSize) where the cumulative deal fits in budget.
  let fullRoundsGuaranteed = 0;
  for (let k = 0; k <= targetSize; k++) {
    if (questionsDealtByRound[k] <= budget) {
      fullRoundsGuaranteed = k;
    }
  }

  // The target *might* get one more if it has capacity in the next round
  // and there's leftover budget after the last full round.
  const hasCapacityForNextRound = targetSize > fullRoundsGuaranteed;
  const hasLeftoverBudget = budget > questionsDealtByRound[fullRoundsGuaranteed];
  const max =
    hasCapacityForNextRound && hasLeftoverBudget ? fullRoundsGuaranteed + 1 : fullRoundsGuaranteed;

  return { min: fullRoundsGuaranteed, max };
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

export function toEditorMetadata(row: StaffAssessmentQuestionRow): EditorQuestionMetadata {
  return {
    question: row.question,
    topic: row.topic,
    course: row.course,
    tags: row.tags,
    other_assessments: row.other_assessments,
    open_issue_count: row.open_issue_count,
    assessment_question_id: row.assessment_question.id,
  };
}

export function buildQuestionMetadata(opts: {
  data: QuestionByQidResult;
  assessment: StaffAssessment;
  courseInstance: StaffCourseInstance;
  courseQuestions?: CourseQuestionForPicker[];
}): EditorQuestionMetadata {
  const { data, assessment, courseInstance, courseQuestions } = opts;

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

  return {
    question: data.question,
    topic: data.topic,
    course: data.course,
    tags: data.tags,
    other_assessments: otherAssessments,
    open_issue_count: data.open_issue_count,
    assessment_question_id: null,
  };
}

/**
 * Computes the set of tags shared across all alternatives in an alt pool.
 * Returns the tag objects from the first alternative that has tags.
 */
export function getSharedTags(
  alternatives: { id: string }[],
  questionMetadata: QuestionMetadataMap,
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

/**
 * Returns the topic shared by all alternatives in an alt pool, or null if they differ.
 */
export function getSharedTopic(
  alternatives: { id: string }[],
  questionMetadata: QuestionMetadataMap,
): StaffTopic | null {
  const topics = alternatives
    .filter((alt) => alt.id && questionMetadata[alt.id])
    .map((alt) => questionMetadata[alt.id]!.topic);
  if (topics.length === 0) return null;
  const firstName = topics[0].name;
  if (topics.every((t) => t.name === firstName)) return topics[0];
  return null;
}

/**
 * Returns a warning message if a tool is enabled in an earlier zone but
 * disabled in a later zone. Students have access to tools in previous
 * zones regardless, so the zone restriction is not actually enforced.
 */
export function getZoneMixedToolsWarning({
  zone: currentZone,
  zones,
  assessmentToolDefaults,
}: {
  zone: ZoneAssessmentForm;
  zones: ZoneAssessmentForm[];
  assessmentToolDefaults: Partial<Record<EnumAssessmentTool, boolean>>;
}): string | null {
  if (zones.length < 2) return null;

  for (const tool of EnumAssessmentToolSchema.options) {
    const defaultValue = assessmentToolDefaults[tool] ?? false;

    let seenEnabled = false;
    for (const zone of zones) {
      const effectiveValue = zone.tools?.[tool]?.enabled ?? defaultValue;
      if (effectiveValue) {
        seenEnabled = true;
      } else if (seenEnabled && currentZone.trackingId === zone.trackingId) {
        const toolLabel = tool[0].toUpperCase() + tool.slice(1);
        return `${toolLabel} is enabled in an earlier zone so students can still access it from earlier questions.`;
      }
    }
  }

  return null;
}
