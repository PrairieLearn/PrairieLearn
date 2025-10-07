import type { Course } from '../../lib/db-types.js';
import { assertNever } from '../../lib/types.js';

import { fastSyncQuestion } from './question.js';

function longestCommonPathPrefix(paths: string[]) {
  if (paths.length === 0) return '';
  if (paths.length === 1) return paths[0];

  const splitPaths = paths.map((p) => p.split('/'));
  const minLength = Math.min(...splitPaths.map((parts) => parts.length));

  const commonSegments: string[] = [];

  for (let i = 0; i < minLength; i++) {
    const segment = splitPaths[0][i];
    if (splitPaths.every((parts) => parts[i] === segment)) {
      commonSegments.push(segment);
    } else {
      break;
    }
  }

  return commonSegments.join('/');
}

function getQuestionFastSyncStrategy(changedFiles: string[]): QuestionFastSync | null {
  if (!changedFiles.every((f) => f.startsWith('questions/'))) return null;

  const commonPrefix = longestCommonPathPrefix(changedFiles);

  if (commonPrefix === 'questions') return null;

  // We can't be 100% sure yet - the common prefix might be a directory that
  // contains multiple questions. We won't know for sure until we actually
  // check disk to see if this is actually a question.
  //
  // There's another weird case where the prefix might be a subdirectory within
  // a question - for instance, if it's `questions/foo/tests`, where `foo` is
  // the question. We'll also have to handle this later.
  return {
    type: 'Question',
    pathPrefix: commonPrefix,
  };
}

interface QuestionFastSync {
  type: 'Question';
  pathPrefix: string;
}

type FastSyncStrategy = QuestionFastSync;

export function getFastSyncStrategy(changedFiles: string[]): FastSyncStrategy | null {
  if (changedFiles.length === 0) return null;

  // We'll aim to handle two possible fast syncing cases for now:
  // - Just a question's `info.json` file has changed.
  // - Any non-JSON question files have changed.
  return getQuestionFastSyncStrategy(changedFiles) ?? null;
}

/**
 * Attempts a fast sync with the given strategy. Returns whether or not the fast
 * sync was able to be performed. This does NOT indicate success of the sync.
 * Rather, the attempted sync may discover that fast sync is not in fact possible.
 * If that's the case, one should fall back to a full sync, which is slower but
 * will correctly handle any unexpected situations. Fast sync is conservative to
 * avoid correctness and consistency issues.
 */
export async function attemptFastSync(
  course: Course,
  strategy: FastSyncStrategy,
): Promise<boolean> {
  switch (strategy.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case 'Question':
      return fastSyncQuestion(course, strategy.pathPrefix);
    default:
      assertNever(strategy.type);
  }
}
