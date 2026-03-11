import type { ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

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
