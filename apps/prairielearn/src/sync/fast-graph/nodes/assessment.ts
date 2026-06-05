import type { ChangedFiles } from '../../../lib/chunks.js';
import type { Course } from '../../../lib/db-types.js';
import { syncSingleAssessment } from '../../fromDisk/assessments.js';
import type { MatchResult, SyncNode, SyncOutcome } from '../engine.js';

export interface AssessmentPayload {
  courseInstanceShortName: string;
  tid: string;
}

/** Parses an `infoAssessment.json` path into its course instance + tid, or null. */
function assessmentFromInfoPath(file: string): AssessmentPayload | null {
  const parts = file.split('/');
  if (
    parts.length < 5 ||
    parts[0] !== 'courseInstances' ||
    parts[2] !== 'assessments' ||
    parts[parts.length - 1] !== 'infoAssessment.json'
  ) {
    return null;
  }
  return { courseInstanceShortName: parts[1], tid: parts.slice(3, -1).join('/') };
}

/**
 * Assessment node. Re-derives a whole assessment from disk — both when its own
 * JSON changed directly and when it's marked dirty by a ripple from a question
 * it references (grading-method change, rename, ...). Either way the sync is the
 * same operation: re-sync this one assessment from disk.
 */
export const assessmentNode: SyncNode = {
  type: 'Assessment',

  key(payload): string {
    const { courseInstanceShortName, tid } = payload as AssessmentPayload;
    return `${courseInstanceShortName}/${tid}`;
  },

  async match(_course: Course, changed: ChangedFiles): Promise<MatchResult> {
    // A modified `infoAssessment.json` marks its assessment dirty (covers direct
    // edits and the in-place rewrite a question rename does to it). We
    // deliberately ignore renamed/deleted assessment JSON: an assessment rename
    // or deletion needs the old tid soft-deleted, which `partial_sync` can't do,
    // so those are left unclaimed and fall back to a full sync.
    const dirty = new Map<string, AssessmentPayload>();
    for (const file of changed.modified) {
      const assessment = assessmentFromInfoPath(file);
      if (assessment) {
        dirty.set(`${assessment.courseInstanceShortName}/${assessment.tid}`, assessment);
      }
    }
    if (dirty.size === 0) return { payloads: [], claimedFiles: [] };

    // Claim every changed file inside a dirty assessment's directory.
    const allPaths = [
      ...changed.modified,
      ...changed.deleted,
      ...changed.renamed.flatMap((r) => [r.from, r.to]),
    ];
    const claimedFiles: string[] = [];
    for (const { courseInstanceShortName, tid } of dirty.values()) {
      const dir = `courseInstances/${courseInstanceShortName}/assessments/${tid}/`;
      for (const file of allPaths) {
        if (file.startsWith(dir)) claimedFiles.push(file);
      }
    }

    return { payloads: [...dirty.values()], claimedFiles };
  },

  async sync(course: Course, payload: unknown): Promise<SyncOutcome> {
    const { courseInstanceShortName, tid } = payload as AssessmentPayload;
    const ok = await syncSingleAssessment({ course, courseInstanceShortName, tid });
    return ok ? { status: 'ok' } : { status: 'fallback' };
  },
};
