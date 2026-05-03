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

function hasPoints(q: {
  points?: number | number[] | null;
  autoPoints?: number | number[] | null;
  manualPoints?: number | null;
}): boolean {
  return q.points != null || q.autoPoints != null || q.manualPoints != null;
}

/**
 * Returns true if any question or alternative in the tree is missing points
 * (considering inheritance from the parent alt pool).
 */
function questionHasMissingPoints(question: ZoneQuestionBlockForm): boolean {
  if (question.alternatives) {
    return question.alternatives.some((alt) => !hasPoints(alt) && !hasPoints(question));
  }
  return !hasPoints(question);
}

export function getStructuralSaveValidationErrorKind(
  zones: ZoneAssessmentForm[],
): 'zone' | 'altPool' | 'questionPoints' | undefined {
  if (zones.some(zoneHasStructuralValidationError)) {
    return 'zone';
  }

  if (zones.some((zone) => zone.questions.some(altPoolHasStructuralValidationError))) {
    return 'altPool';
  }

  if (zones.some((zone) => zone.questions.some(questionHasMissingPoints))) {
    return 'questionPoints';
  }

  return undefined;
}
