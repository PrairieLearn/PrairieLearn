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

function isQuestionFastSyncPossible(changedFiles: string[]) {
  if (!changedFiles.every((f) => f.startsWith('questions/'))) return false;

  const commonPrefix = longestCommonPathPrefix(changedFiles);

  if (commonPrefix === 'questions') return false;

  // We can't be 100% sure yet - the common prefix might be a directory that
  // contains multiple questions. We won't know for sure until we actually
  // check disk to see if this is actually a question.
  //
  // There's another weird case where the prefix might be a subdirectory within
  // a question - for instance, if it's `questions/foo/tests`, where `foo` is
  // the question. We'll also have to handle this later.
  return true;
}

export function isFastSyncPossible(changedFiles: string[]) {
  // We'll aim to handle two possible fast syncing cases for now:
  // - Just a question's `info.json` file has changed.
  // - Any non-JSON question files have changed.

  if (isQuestionFastSyncPossible(changedFiles)) return true;

  return false;
}
