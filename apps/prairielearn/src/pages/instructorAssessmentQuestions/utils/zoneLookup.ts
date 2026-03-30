import type {
  QuestionAlternativeForm,
  SelectedItem,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

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

/**
 * Finds a zone by its trackingId.
 * Returns the zone and its index.
 */
export function findZoneByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): { zone: ZoneAssessmentForm; zoneIndex: number } | null {
  const zoneIndex = zones.findIndex((z) => z.trackingId === trackingId);
  if (zoneIndex === -1) return null;
  return { zone: zones[zoneIndex], zoneIndex };
}

/**
 * Finds an alternative pool by its trackingId across all zones.
 * Returns the alternative pool, parent zone, and their indices.
 */
export function findAltPoolByTrackingId(
  zones: ZoneAssessmentForm[],
  trackingId: string,
): {
  zone: ZoneAssessmentForm;
  zoneIndex: number;
  altPool: ZoneQuestionBlockForm;
  altPoolIndex: number;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const altPoolIndex = zone.questions.findIndex((q) => q.trackingId === trackingId);
    if (altPoolIndex !== -1) {
      return { zone, zoneIndex, altPool: zone.questions[altPoolIndex], altPoolIndex };
    }
  }
  return null;
}

/**
 * Finds an alternative by its trackingId across all zones and question blocks.
 * Returns the alternative, parent question and zone, and their indices.
 */
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
        return {
          alternative: question.alternatives[alternativeIndex],
          alternativeIndex,
          question,
          questionIndex,
          zone,
          zoneIndex,
        };
      }
    }
  }
  return null;
}

/**
 * Finds a question or an alternative by QID across all zones.
 * Returns the parent question and zone, and includes alternative details when matched.
 */
function findQuestionOrAlternativeByQid(
  zones: ZoneAssessmentForm[],
  qid: string,
): {
  question: ZoneQuestionBlockForm;
  questionIndex: number;
  zone: ZoneAssessmentForm;
  zoneIndex: number;
  alternative: QuestionAlternativeForm | null;
  alternativeIndex: number | null;
} | null {
  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const questionIndex = zone.questions.findIndex((q) => q.id === qid);
    if (questionIndex !== -1) {
      return {
        question: zone.questions[questionIndex],
        questionIndex,
        zone,
        zoneIndex,
        alternative: null,
        alternativeIndex: null,
      };
    }
    const parentQuestionIndex = zone.questions.findIndex((q) =>
      q.alternatives?.some((a) => a.id === qid),
    );
    if (parentQuestionIndex !== -1 && zone.questions[parentQuestionIndex].alternatives) {
      const alternativeIndex = zone.questions[parentQuestionIndex].alternatives.findIndex(
        (a) => a.id === qid,
      );
      return {
        question: zone.questions[parentQuestionIndex],
        questionIndex: parentQuestionIndex,
        alternative: zone.questions[parentQuestionIndex].alternatives[alternativeIndex],
        alternativeIndex,
        zone,
        zoneIndex,
      };
    }
  }
  return null;
}

/**
 * Parses the selected query parameter and resolves the initial selected tree item.
 * Supports preselection by question QID and by zone/alternative-group index.
 */
export function getInitialSelectedZoneItem(
  searchParamString: string,
  zones: ZoneAssessmentForm[],
): SelectedItem | null {
  if (!searchParamString || zones.length === 0) {
    return null;
  }

  const searchParams = new URLSearchParams(searchParamString);
  const preselection = searchParams.get('selected');
  if (!preselection || preselection.length < 3) {
    return null;
  }

  const preselectionType = preselection.split(':')[0];

  switch (preselectionType) {
    case 'q': {
      const qid = preselection.slice(2);
      const foundQuestion = findQuestionOrAlternativeByQid(zones, qid);

      if (foundQuestion?.alternative) {
        return {
          type: 'alternative',
          questionTrackingId: foundQuestion.question.trackingId,
          alternativeTrackingId: foundQuestion.alternative.trackingId,
        };
      } else if (foundQuestion) {
        return { type: 'question', questionTrackingId: foundQuestion.question.trackingId };
      }
      return null;
    }

    case 'z': {
      const zoneMatch = /^z:(\d+)$/.exec(preselection);
      if (zoneMatch) {
        const zone = zones.at(Number(zoneMatch[1]));
        return zone ? { type: 'zone', zoneTrackingId: zone.trackingId } : null;
      }

      const altPoolMatch = /^z:(\d+):(\d+)$/.exec(preselection);
      if (altPoolMatch) {
        const zone = zones.at(Number(altPoolMatch[1]));
        const altPool = zone?.questions.at(Number(altPoolMatch[2]));
        return altPool?.alternatives
          ? { type: 'altPool', questionTrackingId: altPool.trackingId }
          : null;
      }
      return null;
    }

    default:
      return null;
  }
}
