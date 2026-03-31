import type { ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

import { validatePositiveInteger } from './questions.js';

function zoneHasStructuralValidationError(zone: ZoneAssessmentForm, zoneIndex: number): boolean {
  if (zone.lockpoint && zoneIndex === 0) {
    return true;
  }

  if (
    zone.numberChoose != null &&
    validatePositiveInteger(zone.numberChoose, 'Number to choose') != null
  ) {
    return true;
  }

  if (
    zone.bestQuestions != null &&
    validatePositiveInteger(zone.bestQuestions, 'Best questions') != null
  ) {
    return true;
  }

  return false;
}

function altPoolHasStructuralValidationError(question: ZoneQuestionBlockForm): boolean {
  if (question.numberChoose == null) {
    return false;
  }

  return validatePositiveInteger(question.numberChoose, 'Number to choose') != null;
}

export function getStructuralSaveValidationErrorKind(
  zones: ZoneAssessmentForm[],
): 'zone' | 'altPool' | undefined {
  if (zones.some(zoneHasStructuralValidationError)) {
    return 'zone';
  }

  if (zones.some((zone) => zone.questions.some(altPoolHasStructuralValidationError))) {
    return 'altPool';
  }

  return undefined;
}
