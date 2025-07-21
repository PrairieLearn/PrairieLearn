import type { QuestionJson } from '../../schemas/infoQuestion.js';

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

function getQuestionFastSyncStrategy(
  changedFiles: string[],
): QuestionJsonFastSync | QuestionFilesFastSync | null {
  if (!changedFiles.every((f) => f.startsWith('questions/'))) return null;

  // If any JSON file was changed, exactly one JSON file must be changed,
  // and only one file may be changed.
  const jsonFileChanged = changedFiles.some((f) => f.endsWith('/info.json'));

  if (jsonFileChanged) {
    if (changedFiles.length === 1) {
      return {
        type: 'QuestionJson',
        pathPrefix: changedFiles[0],
      };
    }

    return null;
  }

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
    type: 'QuestionFiles',
    pathPrefix: commonPrefix,
  };
}

export interface QuestionJsonFastSync {
  type: 'QuestionJson';
  pathPrefix: string;
}

export interface QuestionFilesFastSync {
  type: 'QuestionFiles';
  pathPrefix: string;
}

type FastSyncStrategy = QuestionJsonFastSync | QuestionFilesFastSync;

export function getFastSyncStrategy(changedFiles: string[]): FastSyncStrategy | null {
  // We'll aim to handle two possible fast syncing cases for now:
  // - Just a question's `info.json` file has changed.
  // - Any non-JSON question files have changed.
  return getQuestionFastSyncStrategy(changedFiles) ?? null;
}
