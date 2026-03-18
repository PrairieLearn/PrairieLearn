import type { ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

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
 * Computes the global 1-based question number for a question block at a given
 * zone/question position. Questions are numbered sequentially across all zones.
 */
export function computeQuestionNumber(
  zones: ZoneAssessmentForm[],
  zoneIndex: number,
  questionIndex: number,
): number {
  let n = 0;
  for (let i = 0; i < zoneIndex; i++) n += zones[i].questions.length;
  return n + questionIndex + 1;
}

/**
 * Finds a question by its trackingId across all zones.
 * Returns the question, zone, their indices, and the global question number.
 */
export function findQuestionByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): {
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  questionNumber: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const questionIndex = zone.questions.findIndex((q) => q.trackingId === trackingId);
    if (questionIndex !== -1) {
      return {
        question: zone.questions[questionIndex],
        questionIndex,
        questionNumber: computeQuestionNumber(zones, zoneIndex, questionIndex),
        zone,
        zoneIndex,
      };
    }
  }
  return null;
}
