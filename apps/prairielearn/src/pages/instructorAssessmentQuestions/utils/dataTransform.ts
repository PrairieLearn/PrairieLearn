import { propertyValueWithDefault } from '../../../lib/editorUtil.shared.js';
import type {
  QuestionAlternativeJson,
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

/**
 * Creates a new TrackingId (branded UUID).
 */
function createTrackingId(): TrackingId {
  return crypto.randomUUID() as TrackingId;
}

/**
 * Adds trackingId to zones, questions, and alternatives.
 * Used when initializing editor state from saved data.
 */
export function addTrackingIds(zones: ZoneAssessmentJson[]): ZoneAssessmentForm[] {
  // Cast needed for TypeScript spread inference with union types
  return zones.map((zone) => ({
    ...zone,
    trackingId: createTrackingId(),
    questions: zone.questions.map((question) => ({
      ...question,
      trackingId: createTrackingId(),
      alternatives: question.alternatives?.map((alt) => ({
        ...alt,
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
      questions: questions.map((question: ZoneQuestionBlockForm) => {
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
  } as ZoneQuestionBlockForm;
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
    comment: alternative.comment,
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
    comment: question.comment,

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
      allowRealTimeGrading: zone.allowRealTimeGrading,
      comment: zone.comment,
      canSubmit: propertyValueWithDefault(undefined, zone.canSubmit, isEmptyArray),
      canView: propertyValueWithDefault(undefined, zone.canView, isEmptyArray),
      questions: zone.questions.map(serializeQuestionBlock),
    });
  });
}
