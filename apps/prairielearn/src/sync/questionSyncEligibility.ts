import { config } from '../lib/config.js';
import type { Course } from '../lib/db-types.js';
import { isDraftQid } from '../lib/draft-question.js';
import { validateShortName } from '../lib/short-name.js';

import { CURRENT_SYNC_VERSION } from './version.js';

export function isQuestionQidEligibleForSync(qid: string): boolean {
  // The full loader stores QIDs in a plain object, where __proto__ sets the prototype.
  return validateShortName(qid).valid && !isDraftQid(qid) && qid !== '__proto__';
}

export function hasQuestionSyncBaseline(course: Course, currentHash: string): boolean {
  const previous = course.last_successful_sync;
  return (
    previous?.commitHash === currentHash &&
    previous.commitHash === course.commit_hash &&
    previous.version === CURRENT_SYNC_VERSION &&
    previous.chunksGenerated === config.chunksGenerator
  );
}
