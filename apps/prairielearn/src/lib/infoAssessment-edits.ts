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
function removeQidsFromBlock(
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
function removeQidsFromZone(
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

interface EmptiedZone {
  /** Zero-based index of the zone in the original `assessment.zones`. */
  zoneIndex: number;
  zoneTitle: string | null;
}

/**
 * A reason the deletion cannot proceed because the resulting assessment would
 * fail sync validation. Detected only when the deletion *introduces* the
 * problem (i.e. the pre-deletion file was syncable in this respect).
 */
type DeletionBlocker = { code: 'NEW_FIRST_ZONE_HAS_LOCKPOINT' } | { code: 'NO_ZONES_REMAINING' };

export function blockerDescription(blocker: DeletionBlocker): string {
  switch (blocker.code) {
    case 'NO_ZONES_REMAINING':
      return 'all zones would be empty';
    case 'NEW_FIRST_ZONE_HAS_LOCKPOINT':
      return 'the new first zone would be a lockpoint';
  }
}

export interface BlockedAssessment {
  assessmentId: string;
  assessmentLabel: string;
  assessmentColor: string;
  courseInstanceId: string;
  courseInstanceShortName: string;
  blockers: DeletionBlocker[];
}

interface RemoveQidsFromAssessmentResult {
  assessment: AssessmentJsonInput;
  removedCount: number;
  /**
   * Zones that were non-empty before the removal and would be empty after.
   * These zones are dropped from `assessment`; callers that want to refuse
   * the operation rather than silently discard zone metadata should inspect
   * this list before persisting.
   */
  emptiedZones: EmptiedZone[];
  /**
   * Sync-validation problems newly introduced by the deletion. Callers should
   * refuse to persist when this is non-empty.
   */
  blockers: DeletionBlocker[];
}

/**
 * Returns a copy of `assessment` with any references to `qidsToRemove`
 * filtered out, alongside the list of zones that became empty as a result.
 * Empty zones are dropped from the returned assessment.
 */
export function removeQidsFromAssessment(
  assessment: AssessmentJsonInput,
  qidsToRemove: Set<string>,
): RemoveQidsFromAssessmentResult {
  let removedCount = 0;
  const emptiedZones: EmptiedZone[] = [];
  const zones: ZoneAssessmentJsonInput[] = [];
  for (const [zoneIndex, zone] of (assessment.zones ?? []).entries()) {
    const { questions, removedCount: zoneRemovedCount } = removeQidsFromZone(zone, qidsToRemove);
    removedCount += zoneRemovedCount;
    if (zone.questions.length > 0 && questions.length === 0) {
      emptiedZones.push({ zoneIndex, zoneTitle: zone.title ?? null });
      continue;
    }
    zones.push({ ...zone, questions });
  }

  const originalZones = assessment.zones ?? [];
  const blockers: DeletionBlocker[] = [];
  if (zones.length === 0 && originalZones.length > 0) {
    blockers.push({ code: 'NO_ZONES_REMAINING' });
  }
  if (zones[0]?.lockpoint && !originalZones[0]?.lockpoint) {
    blockers.push({ code: 'NEW_FIRST_ZONE_HAS_LOCKPOINT' });
  }

  return {
    assessment: { ...assessment, zones },
    removedCount,
    emptiedZones,
    blockers,
  };
}
