import type { QuestionAlternativeForm, ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

/**
 * Checks whether a QID already exists somewhere in the assessment zones.
 */
export function isQidInAssessment(zones: ZoneAssessmentForm[], qid: string): boolean {
  for (const zone of zones) {
    for (const q of zone.questions) {
      if (q.id === qid) return true;
      if (q.alternatives?.some((a) => a.id === qid)) return true;
    }
  }
  return false;
}

/**
 * Finds a question by its trackingId across all zones.
 * Returns the question, zone, and their indices, or null if not found.
 */
export function findQuestionByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): {
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const questionIndex = zone.questions.findIndex((q) => q.trackingId === trackingId);
    if (questionIndex !== -1) {
      return { question: zone.questions[questionIndex], questionIndex, zone, zoneIndex };
    }
  }
  return null;
}

export function findAlternativeByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): {
  alternative: QuestionAlternativeForm;
  alternativeIndex: number;
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    for (let questionIndex = 0; questionIndex < zone.questions.length; questionIndex++) {
      const question = zone.questions[questionIndex];
      if (!question.alternatives) continue;
      const alternativeIndex = question.alternatives.findIndex((a) => a.trackingId === trackingId);
      if (alternativeIndex !== -1) {
        return { alternative: question.alternatives[alternativeIndex], alternativeIndex, question, questionIndex, zone, zoneIndex };
      }
    }
  }
  return null;
}