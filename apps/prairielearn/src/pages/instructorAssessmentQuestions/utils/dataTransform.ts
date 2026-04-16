import { propertyValueWithDefault } from '../../../lib/editorUtil.shared.js';
import type {
  QuestionAlternativeJson,
  QuestionPointsJson,
  ZoneAssessmentJson,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJson,
} from '../../../schemas/infoAssessment.js';
import type {
  AltPoolBlockForm,
  QuestionAlternativeForm,
  StandaloneQuestionBlockForm,
  TrackingId,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import type { QuestionMetadataMap } from './questions.js';

/**
 * Creates a new TrackingId (branded UUID).
 */
function createTrackingId(): TrackingId {
  return crypto.randomUUID() as TrackingId;
}

/**
 * Normalizes legacy `points`/`maxPoints` fields for the editor.
 * - For manually-graded questions: `maxPoints` or `points` → `manualPoints`
 * - For all other questions: `points` → `autoPoints`, `maxPoints` → `maxAutoPoints`
 * Only converts when the modern field isn't already set.
 */
function normalizeQuestionPoints<T extends QuestionPointsJson>(
  obj: T,
  isManualGrading: boolean,
): T {
  const result = { ...obj };
  // For Manual questions, the sync code (sync_assessments.sql) uses max_points as
  // computed_manual_points. For Homework, max_points comes from maxPoints ?? points;
  // for Exam, it comes from max(pointsList). We prefer maxPoints when present (Homework),
  // falling back to first(points) (Exam or Homework without maxPoints).
  // Skip if split-point fields (autoPoints/maxAutoPoints) are already set, since those
  // indicate the author is using modern fields and intentionally omitted manualPoints.
  if (
    isManualGrading &&
    result.manualPoints == null &&
    result.autoPoints == null &&
    result.maxAutoPoints == null
  ) {
    const pts =
      result.maxPoints ?? (Array.isArray(result.points) ? result.points[0] : result.points);
    if (pts != null) {
      result.manualPoints = pts;
    }
    delete result.points;
    delete result.maxPoints;
    return result;
  }
  if (result.points != null && result.autoPoints == null) {
    result.autoPoints = result.points;
    delete result.points;
  }
  if (result.maxPoints != null && result.maxAutoPoints == null) {
    result.maxAutoPoints = result.maxPoints;
    delete result.maxPoints;
  }
  return result;
}

/**
 * Returns the effective grading method for an alt pool by examining its alternatives.
 *
 * Alternatives with missing metadata are treated as unknown. If the pool
 * contains both Manual and unknown alternatives, this returns 'mixed' to
 * avoid silently rewriting points when the unknown alternative may be
 * auto-graded.
 */
function getAltPoolGradingMethod(
  alternatives: QuestionAlternativeJson[],
  getGradingMethod: (id?: string) => string | null | undefined,
): 'manual' | 'auto' | 'mixed' {
  const methods = alternatives.map((alt) => getGradingMethod(alt.id));
  const allKnown = methods.every((m) => m != null);
  const hasManual = methods.includes('Manual');
  const hasNonManual = methods.some((m) => m != null && m !== 'Manual');
  const hasUnknown = !allKnown;

  if (hasManual && !hasNonManual && !hasUnknown) return 'manual';
  if (!hasManual) return 'auto'; // all non-manual, all unknown, or non-manual + unknown
  return 'mixed';
}

/** Returns true when a question block uses only legacy point fields. */
function hasLegacyPoints(question: ZoneQuestionBlockJson): boolean {
  return (
    (question.points != null || question.maxPoints != null) &&
    question.autoPoints == null &&
    question.maxAutoPoints == null &&
    question.manualPoints == null
  );
}

function firstPointValue(points: QuestionPointsJson['points']): number | undefined {
  if (points == null) return undefined;
  return Array.isArray(points) ? points[0] : points;
}

/**
 * Materializes pool-level legacy `points`/`maxPoints` onto a single alternative
 * while preserving any point fields the alternative already defines.
 */
function normalizeMixedPoolAlternativePoints(
  alternative: QuestionAlternativeJson,
  poolPoints: QuestionPointsJson['points'],
  poolMaxPoints: QuestionPointsJson['maxPoints'],
  isManualGrading: boolean,
): QuestionAlternativeJson {
  const normalized = normalizeQuestionPoints(alternative, isManualGrading);

  if (isManualGrading) {
    // Check the *original* alternative for manualPoints, not the normalized
    // one. `normalizeQuestionPoints` may have already derived manualPoints
    // from the alternative's own `points`, but the sync code
    // (sync_assessments.ts) resolves manual points as
    // `maxPoints ?? points`, preferring the pool's values when the
    // alternative doesn't define its own. We intentionally overwrite
    // to match that priority: alt maxPoints > pool maxPoints > alt points
    // > pool points.
    if (alternative.manualPoints == null) {
      const effectiveManualPoints =
        alternative.maxPoints ?? poolMaxPoints ?? firstPointValue(alternative.points ?? poolPoints);
      if (effectiveManualPoints != null) {
        normalized.manualPoints = effectiveManualPoints;
      }
    }
  } else {
    // `autoPoints` can be `number | number[]` so we assign directly;
    // `manualPoints` above uses `firstPointValue` because it must be scalar.
    if (normalized.autoPoints == null && (alternative.points ?? poolPoints) != null) {
      normalized.autoPoints = alternative.points ?? poolPoints;
    }
    if (normalized.maxAutoPoints == null && (alternative.maxPoints ?? poolMaxPoints) != null) {
      normalized.maxAutoPoints = alternative.maxPoints ?? poolMaxPoints;
    }
  }

  delete normalized.points;
  delete normalized.maxPoints;
  return normalized;
}

/**
 * For mixed-grading alt pools, copies pool-level `points`/`maxPoints` to each
 * alternative as needed, then normalizes per-alternative based on grading
 * method. Clears points from the pool.
 */
function pushPointsToAlternatives(
  question: ZoneQuestionBlockJson,
  getGradingMethod: (id?: string) => string | null | undefined,
): AltPoolBlockForm {
  const { points, maxPoints, ...poolRest } = question;
  return {
    ...poolRest,
    pointsDistributedInfoBanner: true,
    trackingId: createTrackingId(),
    alternatives: (question.alternatives ?? []).map((alt) => ({
      ...normalizeMixedPoolAlternativePoints(
        alt,
        points,
        maxPoints,
        getGradingMethod(alt.id) === 'Manual',
      ),
      trackingId: createTrackingId(),
    })),
  } as AltPoolBlockForm;
}

/**
 * Prepares raw JSON zones for the editor by adding tracking IDs and
 * normalizing legacy point fields. Converts `points`/`maxPoints` to
 * `autoPoints`/`maxAutoPoints` (or `manualPoints` for manually-graded questions).
 */
export function prepareZonesForEditor(
  zones: ZoneAssessmentJson[],
  questionMetadata: QuestionMetadataMap,
): ZoneAssessmentForm[] {
  const getGradingMethod = (id?: string) =>
    id ? questionMetadata[id]?.question.grading_method : undefined;

  // Cast needed for TypeScript spread inference with union types
  return zones.map((zone) => ({
    ...zone,
    trackingId: createTrackingId(),
    questions: zone.questions.map((question) => {
      // Alt pools have no `id`, so we can't look up a grading method directly.
      // Determine it from the alternatives' grading methods instead.
      const altPoolGradingMethod =
        question.alternatives && !question.id
          ? getAltPoolGradingMethod(question.alternatives, getGradingMethod)
          : undefined;

      if (altPoolGradingMethod === 'mixed' && hasLegacyPoints(question)) {
        return pushPointsToAlternatives(question, getGradingMethod);
      }

      const isManualGrading =
        altPoolGradingMethod === 'manual' || altPoolGradingMethod === 'auto'
          ? altPoolGradingMethod === 'manual'
          : getGradingMethod(question.id) === 'Manual';

      return {
        ...normalizeQuestionPoints(question, isManualGrading),
        trackingId: createTrackingId(),
        alternatives: question.alternatives?.map((alt) => ({
          ...normalizeQuestionPoints(alt, getGradingMethod(alt.id) === 'Manual'),
          trackingId: createTrackingId(),
        })),
      };
    }),
  })) as ZoneAssessmentForm[];
}

/**
 * Strips trackingId from zones, questions, and alternatives.
 * Used when serializing for save.
 */
export function stripTrackingIds(zones: ZoneAssessmentForm[]): ZoneAssessmentJson[] {
  // Cast needed for TypeScript spread inference with union types
  return zones.map((zone) => {
    const { trackingId: _zoneTrackingId, questions, ...zoneRest } = zone;
    return {
      ...zoneRest,
      questions: questions
        .filter((q) => !q.alternatives || q.alternatives.length > 0)
        .map((question: ZoneQuestionBlockForm) => {
          const {
            trackingId: _trackingId,
            pointsDistributedInfoBanner: _banner,
            alternatives,
            ...questionRest
          } = question;
          return {
            ...questionRest,
            alternatives: alternatives?.map((alt: QuestionAlternativeForm) => {
              const { trackingId: _altTrackingId, ...altRest } = alt;
              return altRest;
            }),
          };
        }),
    };
  }) as ZoneAssessmentJson[];
}

/**
 * Creates a new zone with a trackingId.
 */
export function createZoneWithTrackingId(
  zone: Omit<ZoneAssessmentForm, 'trackingId'>,
): ZoneAssessmentForm {
  // Cast needed for TypeScript spread inference with union types
  return {
    ...zone,
    trackingId: createTrackingId(),
  } as ZoneAssessmentForm;
}

/**
 * Creates a new question with a trackingId.
 * New trackingIds are always generated (this is for new questions, not existing ones).
 * Accepts a partial question for creating new empty questions.
 */
export function createQuestionWithTrackingId(): Omit<StandaloneQuestionBlockForm, 'id'> {
  return {
    trackingId: createTrackingId(),
    autoPoints: 1,
  };
}

/**
 * Returns the default point fields for a newly added question based on its grading method.
 */
export function getDefaultPointFieldsForNewQuestion(gradingMethod: string | null | undefined) {
  if (gradingMethod === 'Manual') {
    return {
      autoPoints: undefined,
      manualPoints: 1,
    };
  }
  return {
    autoPoints: 1,
  };
}

/**
 * Creates a new alternative with a trackingId.
 */
export function createAlternativeWithTrackingId(): QuestionAlternativeForm {
  return {
    trackingId: createTrackingId(),
  } as QuestionAlternativeForm;
}

/**
 * Creates a new alternative pool with a trackingId and empty alternatives.
 * Point defaults are chosen when the first question is added, since a blank
 * pool does not yet have a grading method to inherit from.
 */
export function createAltPoolWithTrackingId(): AltPoolBlockForm {
  return {
    trackingId: createTrackingId(),
    alternatives: [],
    canSubmit: [],
    canView: [],
  } as AltPoolBlockForm;
}

/**
 * Converts an alternative to a standalone question block.
 * Preserves trackingId so dnd-kit can track the item mid-drag.
 * Strips undefined own properties so they don't appear as explicit keys
 * in the resulting object.
 *
 * When {@link parentPool} is provided, any inheritable fields that the
 * alternative was inheriting (i.e. undefined on the alternative itself)
 * are filled in from the parent so the standalone question preserves
 * the same effective behavior.
 */
export function alternativeToQuestionBlock(
  alt: QuestionAlternativeForm,
  parentPool?: ZoneQuestionBlockForm,
): StandaloneQuestionBlockForm {
  const merged = { ...alt };
  if (parentPool) {
    merged.autoPoints ??= parentPool.autoPoints;
    merged.manualPoints ??= parentPool.manualPoints;
    merged.maxAutoPoints ??= parentPool.maxAutoPoints;
    merged.triesPerVariant ??= parentPool.triesPerVariant;
    merged.forceMaxPoints ??= parentPool.forceMaxPoints;
    merged.advanceScorePerc ??= parentPool.advanceScorePerc;
    merged.gradeRateMinutes ??= parentPool.gradeRateMinutes;
    merged.allowRealTimeGrading ??= parentPool.allowRealTimeGrading;
  }
  return omitUndefined(merged) as StandaloneQuestionBlockForm;
}

/**
 * Converts a standalone question block to an alternative.
 * Preserves trackingId so dnd-kit can track the item mid-drag.
 */
export function questionBlockToAlternative(block: ZoneQuestionBlockForm): QuestionAlternativeForm {
  const {
    alternatives: _alternatives,
    numberChoose: _numberChoose,
    canSubmit: _canSubmit,
    canView: _canView,
    ...rest
  } = block;
  return { ...rest } as QuestionAlternativeForm;
}

/** Removes keys with undefined values from an object. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Helper to check if a value is an empty array (for canSubmit/canView defaults). */
const isEmptyArray = (v: unknown) => !v || (Array.isArray(v) && v.length === 0);

/**
 * Prepares a question alternative for JSON output.
 * Only removes undefined values, NOT default values - we preserve all explicit values
 * to prevent unintended inheritance from the parent question block.
 */
function serializeQuestionAlternative(alternative: QuestionAlternativeJson) {
  return omitUndefined({
    id: alternative.id,

    points: alternative.points,
    autoPoints: alternative.autoPoints,
    maxPoints: alternative.maxPoints,
    maxAutoPoints: alternative.maxAutoPoints,
    manualPoints: alternative.manualPoints,

    triesPerVariant: alternative.triesPerVariant,
    forceMaxPoints: alternative.forceMaxPoints,
    advanceScorePerc: alternative.advanceScorePerc,
    gradeRateMinutes: alternative.gradeRateMinutes,
    allowRealTimeGrading: alternative.allowRealTimeGrading,
    preferences: alternative.preferences,
    // For some reason, comment gets set to the empty string if it's not set.
    comment: alternative.comment || undefined,
  });
}

/** Serializes a question block for JSON output, stripping default values where appropriate. */
function serializeQuestionBlock(question: ZoneQuestionBlockJson) {
  const isAlternativePool = 'alternatives' in question && question.alternatives;

  return omitUndefined({
    id: isAlternativePool ? undefined : question.id,
    alternatives: isAlternativePool
      ? question.alternatives!.map(serializeQuestionAlternative)
      : undefined,
    numberChoose: question.numberChoose,

    points: question.points,
    autoPoints: question.autoPoints,
    maxPoints: question.maxPoints,
    maxAutoPoints: question.maxAutoPoints,
    manualPoints: question.manualPoints,

    // triesPerVariant and forceMaxPoints don't inherit from zones, so stripping
    // their defaults is safe — the sync code applies the same defaults.
    triesPerVariant: propertyValueWithDefault(undefined, question.triesPerVariant, 1),
    forceMaxPoints: propertyValueWithDefault(undefined, question.forceMaxPoints, false),
    advanceScorePerc: question.advanceScorePerc,
    gradeRateMinutes: question.gradeRateMinutes,
    // Preserve allowRealTimeGrading as-is: stripping the default `true` would
    // silently change behavior when a parent zone/assessment sets `false`,
    // since the sync code inherits question → zone → assessment.
    allowRealTimeGrading: question.allowRealTimeGrading,
    canSubmit: propertyValueWithDefault(undefined, question.canSubmit, isEmptyArray),
    canView: propertyValueWithDefault(undefined, question.canView, isEmptyArray),
    preferences: question.preferences,
    // For some reason, comment gets set to the empty string if it's not set.
    comment: question.comment || undefined,
  });
}

/** Serializes zones for JSON output, stripping default values where appropriate. */
export function serializeZonesForJson(zones: ZoneAssessmentJson[]): ZoneAssessmentJsonInput[] {
  return zones.map((zone) => {
    return omitUndefined({
      title: zone.title,
      lockpoint: zone.lockpoint ? true : undefined,
      maxPoints: zone.maxPoints,
      numberChoose: zone.numberChoose,
      bestQuestions: zone.bestQuestions,
      advanceScorePerc: zone.advanceScorePerc,
      gradeRateMinutes: zone.gradeRateMinutes,
      // Preserve as-is: stripping `true` would change behavior when the
      // assessment-level default is `false`, since sync inherits zone → assessment.
      allowRealTimeGrading: zone.allowRealTimeGrading,
      // Preserve zone-level tool overrides as-is.
      tools: zone.tools,
      // For some reason, comment gets set to the empty string if it's not set.
      comment: zone.comment || undefined,
      canSubmit: propertyValueWithDefault(undefined, zone.canSubmit, isEmptyArray),
      canView: propertyValueWithDefault(undefined, zone.canView, isEmptyArray),
      questions: zone.questions
        .filter((q) => !('alternatives' in q && q.alternatives?.length === 0))
        .map(serializeQuestionBlock),
    });
  });
}
