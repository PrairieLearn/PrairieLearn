import { propertyValueWithDefault } from '../../../lib/editorUtil.shared.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionBlockJson,
} from '../../../schemas/infoAssessment.js';
import type {
  QuestionAlternativeForm,
  TrackingId,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../instructorAssessmentQuestions.shared.js';

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
 */
export function createQuestionWithTrackingId(
  question: ZoneQuestionBlockJson,
): ZoneQuestionBlockForm {
  // Cast needed for TypeScript spread inference with union types
  return {
    ...question,
    trackingId: createTrackingId(),
    alternatives: question.alternatives?.map((alt) => ({
      ...alt,
      trackingId: createTrackingId(),
    })),
  } as ZoneQuestionBlockForm;
}

/** Removes keys with undefined values from an object. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Helper to check if a value is an empty array (for canSubmit/canView defaults). */
const isEmptyArray = (v: unknown) => !v || (Array.isArray(v) && v.length === 0);

/** Filters an alternative to remove default values. Only outputs known schema fields. */
function stripQuestionAlternative(alternative: QuestionAlternativeJson): Record<string, unknown> {
  return omitUndefined({
    id: alternative.id,
    points: propertyValueWithDefault(undefined, alternative.points, 0),
    autoPoints: propertyValueWithDefault(undefined, alternative.autoPoints, 0),
    maxPoints: propertyValueWithDefault(undefined, alternative.maxPoints, 0),
    maxAutoPoints: propertyValueWithDefault(undefined, alternative.maxAutoPoints, 0),
    manualPoints: propertyValueWithDefault(undefined, alternative.manualPoints, 0),
    triesPerVariant: propertyValueWithDefault(undefined, alternative.triesPerVariant, 1),
    advanceScorePerc: propertyValueWithDefault(undefined, alternative.advanceScorePerc, null),
    gradeRateMinutes: propertyValueWithDefault(undefined, alternative.gradeRateMinutes, null),
    allowRealTimeGrading: propertyValueWithDefault(
      undefined,
      alternative.allowRealTimeGrading,
      null,
    ),
    forceMaxPoints: propertyValueWithDefault(undefined, alternative.forceMaxPoints, null),
    comment: propertyValueWithDefault(undefined, alternative.comment, null),
  });
}

/** Filters a question to remove default values. Only outputs known schema fields. */
function stripQuestionBlock(question: ZoneQuestionBlockJson): Record<string, unknown> {
  const isAlternativeGroup = 'alternatives' in question && question.alternatives;

  return omitUndefined({
    // Alternative group vs single question handling
    id: isAlternativeGroup ? undefined : question.id,
    alternatives: isAlternativeGroup
      ? question.alternatives!.map(stripQuestionAlternative)
      : undefined,
    numberChoose: isAlternativeGroup
      ? propertyValueWithDefault(undefined, question.numberChoose, 1)
      : undefined,
    // Common fields for all questions
    comment: propertyValueWithDefault(undefined, question.comment, null),
    allowRealTimeGrading: propertyValueWithDefault(undefined, question.allowRealTimeGrading, null),
    forceMaxPoints: propertyValueWithDefault(undefined, question.forceMaxPoints, null),
    canSubmit: propertyValueWithDefault(undefined, question.canSubmit, isEmptyArray),
    canView: propertyValueWithDefault(undefined, question.canView, isEmptyArray),
    points: propertyValueWithDefault(undefined, question.points, 0),
    autoPoints: propertyValueWithDefault(undefined, question.autoPoints, 0),
    maxPoints: propertyValueWithDefault(undefined, question.maxPoints, null),
    maxAutoPoints: propertyValueWithDefault(undefined, question.maxAutoPoints, 0),
    manualPoints: propertyValueWithDefault(undefined, question.manualPoints, 0),
    triesPerVariant: propertyValueWithDefault(undefined, question.triesPerVariant, 1),
    advanceScorePerc: propertyValueWithDefault(undefined, question.advanceScorePerc, null),
    gradeRateMinutes: propertyValueWithDefault(undefined, question.gradeRateMinutes, null),
  });
}

/**
 * Strips default values from zones before saving to JSON.
 * Only outputs fields defined in the schema (unknown fields are NOT preserved).
 */
export function stripZoneDefaults(zones: ZoneAssessmentJson[]): ZoneAssessmentJson[] {
  return zones.map((zone) => {
    return omitUndefined({
      title: propertyValueWithDefault(undefined, zone.title, null),
      maxPoints: propertyValueWithDefault(undefined, zone.maxPoints, null),
      numberChoose: propertyValueWithDefault(undefined, zone.numberChoose, null),
      bestQuestions: propertyValueWithDefault(undefined, zone.bestQuestions, null),
      advanceScorePerc: propertyValueWithDefault(undefined, zone.advanceScorePerc, null),
      gradeRateMinutes: propertyValueWithDefault(undefined, zone.gradeRateMinutes, null),
      comment: propertyValueWithDefault(undefined, zone.comment, null),
      allowRealTimeGrading: propertyValueWithDefault(undefined, zone.allowRealTimeGrading, null),
      canSubmit: propertyValueWithDefault(undefined, zone.canSubmit, isEmptyArray),
      canView: propertyValueWithDefault(undefined, zone.canView, isEmptyArray),
      questions: zone.questions.map(stripQuestionBlock),
    }) as ZoneAssessmentJson;
  });
}
