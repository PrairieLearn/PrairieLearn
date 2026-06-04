import type { Course } from '../../lib/db-types.js';

import { type FastSyncResult, type SyncNode, runFastSync } from './engine.js';
import { assessmentNode } from './nodes/assessment.js';
import { questionNode } from './nodes/question.js';

/**
 * The sync dependency graph. Adding a new fast-sync case is a matter of adding
 * one {@link SyncNode} here — the engine and the other nodes are untouched.
 */
export const REGISTRY: SyncNode[] = [questionNode, assessmentNode];

/**
 * Attempts a graph-based fast sync. Returns `{ ok: false }` if any part of the
 * change couldn't be fast-synced, in which case the caller must fall back to a
 * full sync.
 */
export async function attemptGraphFastSync(
  course: Course,
  changedFiles: string[],
): Promise<FastSyncResult> {
  return await runFastSync(course, changedFiles, REGISTRY);
}
