import type {
  AssessmentJsonInput,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJsonInput,
} from '../schemas/infoAssessment.js';

/**
 * Removes any references to `qidsToRemove` from a single zone-question block.
 * For alternative groups, filters the alternatives list; the block itself is
 * dropped only when all alternatives are removed. For direct QID references,
 * the block is dropped when its QID matches.
 */
export function removeQidsFromBlock(
  block: ZoneQuestionBlockJsonInput,
  qidsToRemove: Set<string>,
): { block: ZoneQuestionBlockJsonInput | null; removedCount: number } {
  if (block.alternatives) {
    const alternatives = block.alternatives.filter(
      (alternative) => !qidsToRemove.has(alternative.id),
    );
    return {
      block: alternatives.length > 0 ? { ...block, alternatives } : null,
      removedCount: block.alternatives.length - alternatives.length,
    };
  }

  if (block.id && qidsToRemove.has(block.id)) {
    return { block: null, removedCount: 1 };
  }
  return { block, removedCount: 0 };
}

/**
 * Removes any references to `qidsToRemove` from a single zone's question
 * blocks, returning the surviving blocks alongside a count of removed
 * references. Does not mutate the input.
 */
export function removeQidsFromZone(
  zone: ZoneAssessmentJsonInput,
  qidsToRemove: Set<string>,
): { questions: ZoneQuestionBlockJsonInput[]; removedCount: number } {
  let removedCount = 0;
  const questions: ZoneQuestionBlockJsonInput[] = [];
  for (const block of zone.questions) {
    const result = removeQidsFromBlock(block, qidsToRemove);
    removedCount += result.removedCount;
    if (result.block) questions.push(result.block);
  }
  return { questions, removedCount };
}

/**
 * Returns a copy of `assessment` with any references to `qidsToRemove`
 * filtered out. Zones whose question list becomes empty are dropped.
 */
export function removeQidsFromAssessment(
  assessment: AssessmentJsonInput,
  qidsToRemove: Set<string>,
): AssessmentJsonInput {
  const zones: ZoneAssessmentJsonInput[] = [];
  for (const zone of assessment.zones ?? []) {
    const { questions } = removeQidsFromZone(zone, qidsToRemove);
    if (questions.length === 0) continue;
    zones.push({ ...zone, questions });
  }
  return { ...assessment, zones };
}
