import type {
  AssessmentJsonInput,
  ZoneAssessmentJsonInput,
  ZoneQuestionBlockJsonInput,
} from '../schemas/infoAssessment.js';

/** Maps a QID reference to its replacement; return the same QID for a no-op, or `null` to drop it. */
type QidMapper = (qid: string) => string | null;

/**
 * Maps every QID reference in a block. An alternative group's block is dropped
 * only once all its alternatives are dropped. Does not mutate the input.
 */
function mapQidsInBlock(
  block: ZoneQuestionBlockJsonInput,
  mapQid: QidMapper,
): { block: ZoneQuestionBlockJsonInput | null; changedCount: number } {
  if (block.alternatives) {
    let changedCount = 0;
    const alternatives: typeof block.alternatives = [];
    for (const alternative of block.alternatives) {
      const newId = mapQid(alternative.id);
      if (newId === null) {
        changedCount += 1;
        continue;
      }
      if (newId !== alternative.id) {
        changedCount += 1;
        alternatives.push({ ...alternative, id: newId });
      } else {
        alternatives.push(alternative);
      }
    }
    return {
      block: alternatives.length > 0 ? { ...block, alternatives } : null,
      changedCount,
    };
  }

  if (block.id) {
    const newId = mapQid(block.id);
    if (newId === null) {
      return { block: null, changedCount: 1 };
    }
    if (newId !== block.id) {
      return { block: { ...block, id: newId }, changedCount: 1 };
    }
  }
  return { block, changedCount: 0 };
}

function mapQidsInZone(
  zone: ZoneAssessmentJsonInput,
  mapQid: QidMapper,
): { questions: ZoneQuestionBlockJsonInput[]; changedCount: number } {
  let changedCount = 0;
  const questions: ZoneQuestionBlockJsonInput[] = [];
  for (const block of zone.questions) {
    const result = mapQidsInBlock(block, mapQid);
    changedCount += result.changedCount;
    if (result.block) questions.push(result.block);
  }
  return { questions, changedCount };
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
  /** The QIDs being deleted that this assessment references; the questions to skip to unblock it. */
  affectedQids: string[];
}

interface MapAssessmentQidsResult {
  assessment: AssessmentJsonInput;
  /** Number of QID references that were rewritten or dropped. */
  changedCount: number;
  /** Zones that were non-empty before but had all their references dropped; removed from `assessment`. */
  emptiedZones: EmptiedZone[];
}

/**
 * The single canonical traversal of an assessment's question references: applies
 * `mapQid` to every reference across all zones, blocks, and alternative groups.
 * Deletion maps each removed QID to `null`; renaming maps the old QID to the new
 * one. Emptied zones are dropped. Does not mutate the input.
 */
function mapAssessmentQids(
  assessment: AssessmentJsonInput,
  mapQid: QidMapper,
): MapAssessmentQidsResult {
  let changedCount = 0;
  const emptiedZones: EmptiedZone[] = [];
  const zones: ZoneAssessmentJsonInput[] = [];
  for (const [zoneIndex, zone] of (assessment.zones ?? []).entries()) {
    const { questions, changedCount: zoneChangedCount } = mapQidsInZone(zone, mapQid);
    changedCount += zoneChangedCount;
    if (zone.questions.length > 0 && questions.length === 0) {
      emptiedZones.push({ zoneIndex, zoneTitle: zone.title ?? null });
      continue;
    }
    zones.push({ ...zone, questions });
  }
  return { assessment: { ...assessment, zones }, changedCount, emptiedZones };
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
  /** The subset of `qidsToRemove` actually referenced by this assessment. */
  matchedQids: string[];
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
  const matchedQids = new Set<string>();
  const {
    assessment: updated,
    changedCount,
    emptiedZones,
  } = mapAssessmentQids(assessment, (qid) => {
    if (qidsToRemove.has(qid)) {
      matchedQids.add(qid);
      return null;
    }
    return qid;
  });

  const originalZones = assessment.zones ?? [];
  const newZones = updated.zones ?? [];
  const blockers: DeletionBlocker[] = [];
  if (newZones.length === 0 && originalZones.length > 0) {
    blockers.push({ code: 'NO_ZONES_REMAINING' });
  }
  if (newZones[0]?.lockpoint && !originalZones[0]?.lockpoint) {
    blockers.push({ code: 'NEW_FIRST_ZONE_HAS_LOCKPOINT' });
  }

  return {
    assessment: updated,
    removedCount: changedCount,
    emptiedZones,
    blockers,
    matchedQids: [...matchedQids],
  };
}

/** Returns a copy of `assessment` with every reference to `oldQid` rewritten to `newQid`. */
export function renameQidInAssessment(
  assessment: AssessmentJsonInput,
  oldQid: string,
  newQid: string,
): { assessment: AssessmentJsonInput; renamedCount: number } {
  const { assessment: updated, changedCount } = mapAssessmentQids(assessment, (qid) =>
    qid === oldQid ? newQid : qid,
  );
  return { assessment: updated, renamedCount: changedCount };
}
