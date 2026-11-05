import { isDraftQid } from '../lib/draft-question.js';
import { validateShortName } from '../lib/short-name.js';

export function isQuestionQidEligibleForSync(qid: string): boolean {
  // The full loader stores QIDs in a plain object, where __proto__ sets the prototype.
  return validateShortName(qid).valid && !isDraftQid(qid) && qid !== '__proto__';
}
