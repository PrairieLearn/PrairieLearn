import type { EnumAssessmentType } from '../../../lib/db-types.js';
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

/**
 * Returns true if any zone, question, or alt pool in the tree has
 * `allowRealTimeGrading` explicitly set to `false`, which is invalid
 * for Homework assessments.
 */
function hasRealTimeGradingDisabled(zones: ZoneAssessmentForm[]): boolean {
  return zones.some((zone) => {
    if (zone.allowRealTimeGrading === false) return true;
    return zone.questions.some((question) => {
      if (question.allowRealTimeGrading === false) return true;
      return question.alternatives?.some((alt) => alt.allowRealTimeGrading === false) ?? false;
    });
  });
}

export type StructuralSaveValidationErrorKind =
  | 'zone'
  | 'altPool'
  | 'questionPoints'
  | 'homeworkRealTimeGrading';

export function getStructuralSaveValidationErrorKind(
  zones: ZoneAssessmentForm[],
  assessmentType: EnumAssessmentType,
): StructuralSaveValidationErrorKind | undefined {
  if (zones.some(zoneHasStructuralValidationError)) {
    return 'zone';
  }

  if (zones.some((zone) => zone.questions.some(altPoolHasStructuralValidationError))) {
    return 'altPool';
  }

  if (zones.some((zone) => zone.questions.some(questionHasMissingPoints))) {
    return 'questionPoints';
  }

  if (assessmentType === 'Homework' && hasRealTimeGradingDisabled(zones)) {
    return 'homeworkRealTimeGrading';
  }

  return undefined;
}
