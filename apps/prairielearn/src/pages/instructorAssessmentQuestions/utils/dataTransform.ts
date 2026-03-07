import { propertyValueWithDefault } from '../../../lib/editorUtil.shared.js';
import type {
  QuestionAlternativeJson,
  QuestionPointsJson,
  ZoneAssessmentJson,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJson,
} from '../../../schemas/infoAssessment.js';
import type {
  QuestionAlternativeForm,
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
 * - For manually-graded questions: `points` → `manualPoints` (when `manualPoints` is not set)
 * - For all other questions: `points` → `autoPoints`, `maxPoints` → `maxAutoPoints`
 * Only converts when the modern field isn't already set.
 */
function normalizeQuestionPoints<T extends QuestionPointsJson>(obj: T, gradingMethod?: string): T {
  const result = { ...obj };
  if (gradingMethod === 'Manual' && result.points != null && result.manualPoints == null) {
    result.manualPoints = Array.isArray(result.points) ? result.points[0] : result.points;
    delete result.points;
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
    questions: zone.questions.map((question) => ({
      ...normalizeQuestionPoints(question, getGradingMethod(question.id)),
      trackingId: createTrackingId(),
      alternatives: question.alternatives?.map((alt) => ({
        ...normalizeQuestionPoints(alt, getGradingMethod(alt.id)),
        trackingId: createTrackingId(),
      })),
    })),
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
          const { trackingId: _trackingId, alternatives, ...questionRest } = question;
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
export function createQuestionWithTrackingId(): ZoneQuestionBlockForm {
  // Cast needed for TypeScript spread inference with union types
  return {
    trackingId: createTrackingId(),
    autoPoints: 1,
  } as ZoneQuestionBlockForm;
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
 * Creates a new alternative group with a trackingId and empty alternatives.
 */
export function createAltGroupWithTrackingId(): ZoneQuestionBlockForm {
  return {
    trackingId: createTrackingId(),
    alternatives: [],
    numberChoose: 1,
    canSubmit: [],
    canView: [],
    autoPoints: 1,
  } as ZoneQuestionBlockForm;
}

/**
 * Converts an alternative to a standalone question block.
 * Preserves trackingId so dnd-kit can track the item mid-drag.
 * When a parent block is provided, inherited fields (points, triesPerVariant,
 * advanced settings) are resolved so the extracted question retains its
 * effective values rather than losing them.
 */
export function alternativeToQuestionBlock(
  alt: QuestionAlternativeForm,
  parent?: ZoneQuestionBlockForm,
): ZoneQuestionBlockForm {
  if (!parent) return { ...alt } as ZoneQuestionBlockForm;

  return {
    points: alt.points ?? parent.points,
    autoPoints: alt.autoPoints ?? parent.autoPoints,
    maxPoints: alt.maxPoints ?? parent.maxPoints,
    maxAutoPoints: alt.maxAutoPoints ?? parent.maxAutoPoints,
    manualPoints: alt.manualPoints ?? parent.manualPoints,
    triesPerVariant: alt.triesPerVariant ?? parent.triesPerVariant,
    forceMaxPoints: alt.forceMaxPoints ?? parent.forceMaxPoints,
    advanceScorePerc: alt.advanceScorePerc ?? parent.advanceScorePerc,
    gradeRateMinutes: alt.gradeRateMinutes ?? parent.gradeRateMinutes,
    allowRealTimeGrading: alt.allowRealTimeGrading ?? parent.allowRealTimeGrading,
    ...alt,
  } as ZoneQuestionBlockForm;
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
    advanceScorePerc: alternative.advanceScorePerc,
    gradeRateMinutes: alternative.gradeRateMinutes,
    forceMaxPoints: alternative.forceMaxPoints,
    allowRealTimeGrading: alternative.allowRealTimeGrading,
    // For some reason, comment gets set to the empty string if it's not set.
    comment: alternative.comment || undefined,
  });
}

/** Serializes a question block for JSON output, stripping default values where appropriate. */
function serializeQuestionBlock(question: ZoneQuestionBlockJson) {
  const isAlternativeGroup = 'alternatives' in question && question.alternatives;

  return omitUndefined({
    id: isAlternativeGroup ? undefined : question.id,
    alternatives: isAlternativeGroup
      ? question.alternatives!.map(serializeQuestionAlternative)
      : undefined,
    numberChoose: question.numberChoose,
    // For some reason, comment gets set to the empty string if it's not set.
    comment: question.comment || undefined,

    // These defaults will be inherited by question alternatives, unless they override them.
    // These should mirror the defaults from assessment syncing.
    allowRealTimeGrading: propertyValueWithDefault(undefined, question.allowRealTimeGrading, true),
    triesPerVariant: propertyValueWithDefault(undefined, question.triesPerVariant, 1),
    forceMaxPoints: propertyValueWithDefault(undefined, question.forceMaxPoints, false),

    canSubmit: propertyValueWithDefault(undefined, question.canSubmit, isEmptyArray),
    canView: propertyValueWithDefault(undefined, question.canView, isEmptyArray),
    points: question.points,
    autoPoints: question.autoPoints,
    maxPoints: question.maxPoints,
    maxAutoPoints: question.maxAutoPoints,
    manualPoints: question.manualPoints,
    advanceScorePerc: question.advanceScorePerc,
    gradeRateMinutes: question.gradeRateMinutes,
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
      allowRealTimeGrading: propertyValueWithDefault(undefined, zone.allowRealTimeGrading, true),
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
