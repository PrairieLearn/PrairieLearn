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
 * `changedQids` lists the original QIDs that `mapQid` rewrote or dropped.
 */
function mapQidsInBlock(
  block: ZoneQuestionBlockJsonInput,
  mapQid: QidMapper,
): { block: ZoneQuestionBlockJsonInput | null; changedQids: string[] } {
  if (block.alternatives) {
    const changedQids: string[] = [];
    const alternatives: typeof block.alternatives = [];
    for (const alternative of block.alternatives) {
      const newId = mapQid(alternative.id);
      if (newId === null) {
        changedQids.push(alternative.id);
        continue;
      }
      if (newId !== alternative.id) {
        changedQids.push(alternative.id);
        alternatives.push({ ...alternative, id: newId });
      } else {
        alternatives.push(alternative);
      }
    }
    return {
      block: alternatives.length > 0 ? { ...block, alternatives } : null,
      changedQids,
    };
  }

  if (block.id) {
    const newId = mapQid(block.id);
    if (newId === null) {
      return { block: null, changedQids: [block.id] };
    }
    if (newId !== block.id) {
      return { block: { ...block, id: newId }, changedQids: [block.id] };
    }
  }
  return { block, changedQids: [] };
}

function mapQidsInZone(
  zone: ZoneAssessmentJsonInput,
  mapQid: QidMapper,
): { questions: ZoneQuestionBlockJsonInput[]; changedQids: string[] } {
  const changedQids: string[] = [];
  const questions: ZoneQuestionBlockJsonInput[] = [];
  for (const block of zone.questions) {
    const result = mapQidsInBlock(block, mapQid);
    changedQids.push(...result.changedQids);
    if (result.block) questions.push(result.block);
  }
  return { questions, changedQids };
}

interface EmptiedZone {
  /** Zero-based index of the zone in the original `assessment.zones`. */
  zoneIndex: number;
  zoneTitle: string | null;
}

export interface AffectedZone {
  /** Zero-based index of the zone in the original `assessment.zones`. */
  zoneIndex: number;
  zoneTitle: string | null;
  /** The original QIDs in this zone that `mapQid` rewrote or dropped. */
  affectedQids: string[];
  /** Whether the zone was non-empty before but had all its references dropped. */
  wouldBeEmpty: boolean;
}

interface MapAssessmentQidsResult {
  assessment: AssessmentJsonInput;
  /** Number of QID references that were rewritten or dropped. */
  changedCount: number;
  /** Zones that were non-empty before but had all their references dropped; removed from `assessment`. */
  emptiedZones: EmptiedZone[];
  /** Per-zone breakdown of changed references; only includes zones with at least one change. */
  affectedZones: AffectedZone[];
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
  const affectedZones: AffectedZone[] = [];
  const zones: ZoneAssessmentJsonInput[] = [];
  for (const [zoneIndex, zone] of (assessment.zones ?? []).entries()) {
    const { questions, changedQids } = mapQidsInZone(zone, mapQid);
    changedCount += changedQids.length;
    const wouldBeEmpty = zone.questions.length > 0 && questions.length === 0;
    if (changedQids.length > 0) {
      affectedZones.push({
        zoneIndex,
        zoneTitle: zone.title ?? null,
        affectedQids: changedQids,
        wouldBeEmpty,
      });
    }
    if (wouldBeEmpty) {
      emptiedZones.push({ zoneIndex, zoneTitle: zone.title ?? null });
      continue;
    }
    zones.push({ ...zone, questions });
  }
  return { assessment: { ...assessment, zones }, changedCount, emptiedZones, affectedZones };
}

/**
 * Collects every QID referenced by `assessment` across its zones, blocks, and
 * alternative groups, reusing the canonical traversal so callers never re-walk
 * the structure themselves.
 */
export function collectAssessmentQids(assessment: AssessmentJsonInput): Set<string> {
  const qids = new Set<string>();
  mapAssessmentQids(assessment, (qid) => {
    qids.add(qid);
    return qid;
  });
  return qids;
}

interface RemoveQidsFromAssessmentResult {
  assessment: AssessmentJsonInput;
  removedCount: number;
  /**
   * Zones that were non-empty before the removal and would be empty after.
   * These zones are dropped from `assessment`. An assessment with no zones is
   * valid, so callers can persist this result without further checks.
   */
  emptiedZones: EmptiedZone[];
  /**
   * How many zone lockpoints the removal relocated to a later zone or dropped.
   * A lockpoint on a dropped zone shifts to the next surviving zone (or is
   * removed if there is no later selectable zone), and a lockpoint that would
   * land on the new first zone is removed (the first zone cannot be a lockpoint).
   */
  lockpointsMovedOrRemoved: number;
  /** The subset of `qidsToRemove` actually referenced by this assessment. */
  matchedQids: string[];
  /** Per-zone breakdown of which references were removed; only zones that lost a reference. */
  affectedZones: AffectedZone[];
}

/**
 * Keeps the surviving zones' lockpoints valid after empty zones are dropped:
 * a lockpoint on a dropped zone shifts to the next surviving selectable zone
 * (or is removed if there is none), and a lockpoint that ends up on the first
 * zone is removed (the first zone cannot be a lockpoint). Returns the adjusted
 * zones and how many lockpoints were moved or removed as a result.
 */
function reconcileLockpoints({
  originalZones,
  survivingZones,
  emptiedZones,
}: {
  originalZones: ZoneAssessmentJsonInput[];
  survivingZones: ZoneAssessmentJsonInput[];
  emptiedZones: EmptiedZone[];
}): { zones: ZoneAssessmentJsonInput[]; lockpointsMovedOrRemoved: number } {
  const emptiedIndices = new Set(emptiedZones.map((zone) => zone.zoneIndex));
  const survivingOriginalIndices = originalZones
    .map((_, index) => index)
    .filter((index) => !emptiedIndices.has(index));

  const zones = survivingZones.map((zone) => ({ ...zone }));
  let lockpointsMovedOrRemoved = 0;

  for (const { zoneIndex } of emptiedZones) {
    if (!originalZones[zoneIndex]?.lockpoint) continue;
    lockpointsMovedOrRemoved += 1;
    const targetIndex = survivingOriginalIndices.findIndex(
      (index, survivingIndex) => index > zoneIndex && zones[survivingIndex].numberChoose !== 0,
    );
    if (targetIndex !== -1) {
      zones[targetIndex] = { ...zones[targetIndex], lockpoint: true };
    }
  }

  if (zones[0]?.lockpoint) {
    // A surviving zone promoted to first while carrying its own lockpoint has
    // that lockpoint removed here; a lockpoint that merely shifted onto it was
    // already counted above, and a pre-existing first-zone lockpoint isn't
    // something this deletion introduced.
    const firstOriginalIndex = survivingOriginalIndices[0];
    if (firstOriginalIndex !== 0 && originalZones[firstOriginalIndex]?.lockpoint) {
      lockpointsMovedOrRemoved += 1;
    }
    zones[0] = { ...zones[0], lockpoint: false };
  }

  return { zones, lockpointsMovedOrRemoved };
}

/**
 * Returns a copy of `assessment` with any references to `qidsToRemove`
 * filtered out. Zones emptied by the removal are dropped, and the lockpoints of
 * surviving zones are kept valid (see {@link reconcileLockpoints}).
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
    affectedZones,
  } = mapAssessmentQids(assessment, (qid) => {
    if (qidsToRemove.has(qid)) {
      matchedQids.add(qid);
      return null;
    }
    return qid;
  });

  const { zones, lockpointsMovedOrRemoved } = reconcileLockpoints({
    originalZones: assessment.zones ?? [],
    survivingZones: updated.zones ?? [],
    emptiedZones,
  });

  return {
    assessment: { ...updated, zones },
    removedCount: changedCount,
    emptiedZones,
    lockpointsMovedOrRemoved,
    matchedQids: [...matchedQids],
    affectedZones,
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
