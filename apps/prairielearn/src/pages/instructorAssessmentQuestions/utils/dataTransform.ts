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

/** Strips a question alternative to remove default values. */
function stripQuestionAlternative(alternative: QuestionAlternativeJson) {
  // We cannot do any stripping here.
  // If we strip, some of the fields will be inherited from the question itself.
  // Thus, we should always write the value we got to prevent stripping,
  // because in the future, if the question values change, we don't want to inherit them.
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

/** Strips a question to remove default values. */
function stripQuestionBlock(question: ZoneQuestionBlockJson) {
  const isAlternativeGroup = 'alternatives' in question && question.alternatives;

  return omitUndefined({
    id: isAlternativeGroup ? undefined : question.id,
    alternatives: isAlternativeGroup
      ? question.alternatives!.map(stripQuestionAlternative)
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

/** Strips default values from zones before saving to JSON */
export function stripZoneDefaults(zones: ZoneAssessmentJson[]): ZoneAssessmentJson[] {
  return zones.map((zone) => {
    return omitUndefined({
      title: zone.title,
      maxPoints: zone.maxPoints,
      numberChoose: zone.numberChoose,
      bestQuestions: zone.bestQuestions,
      advanceScorePerc: zone.advanceScorePerc,
      gradeRateMinutes: zone.gradeRateMinutes,
      allowRealTimeGrading: zone.allowRealTimeGrading,
      comment: zone.comment,
      canSubmit: propertyValueWithDefault(undefined, zone.canSubmit, isEmptyArray),
      canView: propertyValueWithDefault(undefined, zone.canView, isEmptyArray),
      questions: zone.questions.map(stripQuestionBlock),
    });
  });
}
