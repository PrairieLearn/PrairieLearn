import type { ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

import { computeZoneQuestionCount, validatePositiveInteger } from './questions.js';

function zoneHasStructuralValidationError(zone: ZoneAssessmentForm, zoneIndex: number): boolean {
  if (zone.lockpoint && zoneIndex === 0) {
    return true;
  }

  const questionCount = computeZoneQuestionCount(zone.questions);

  if (
    zone.numberChoose != null &&
    (validatePositiveInteger(zone.numberChoose, 'Number to choose') != null ||
      zone.numberChoose > questionCount)
  ) {
    return true;
  }

  if (
    zone.bestQuestions != null &&
    (validatePositiveInteger(zone.bestQuestions, 'Best questions') != null ||
      zone.bestQuestions > questionCount ||
      (zone.numberChoose != null && zone.bestQuestions > zone.numberChoose))
  ) {
    return true;
  }

  return false;
}

function altGroupHasStructuralValidationError(question: ZoneQuestionBlockForm): boolean {
  const alternativeCount = question.alternatives?.length;
  if (alternativeCount == null || question.numberChoose == null) {
    return false;
  }

  return (
    validatePositiveInteger(question.numberChoose, 'Number to choose') != null ||
    question.numberChoose > alternativeCount
  );
}

export function getStructuralSaveValidationErrorKind(
  zones: ZoneAssessmentForm[],
): 'zone' | 'altGroup' | undefined {
  if (zones.some(zoneHasStructuralValidationError)) {
    return 'zone';
  }

  if (zones.some((zone) => zone.questions.some(altGroupHasStructuralValidationError))) {
    return 'altGroup';
  }

  return undefined;
}
