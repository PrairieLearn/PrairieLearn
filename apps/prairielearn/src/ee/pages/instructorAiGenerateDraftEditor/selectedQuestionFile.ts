import type { Stats } from 'node:fs';
import * as path from 'node:path';

// @ts-expect-error No types for ace-code/src/ext/modelist.js
import { getModeForPath } from 'ace-code/src/ext/modelist.js';
import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';

import { b64EncodeUnicode } from '../../../lib/base64-util.js';
import type { Course, Question } from '../../../lib/db-types.js';

export interface SelectedQuestionFile {
  path: string;
  contents: string;
  aceMode: string;
}

export function getSelectedQuestionFilePath(queryValue: unknown): string | null {
  if (queryValue == null) return null;
  if (Array.isArray(queryValue)) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }
  if (typeof queryValue !== 'string') {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }
  return normalizeQuestionFilePath(queryValue);
}

export function normalizeQuestionFilePath(filePath: string): string {
  const trimmedPath = filePath.trim();
  if (trimmedPath === '' || trimmedPath.includes('\0') || trimmedPath.includes('\\')) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }

  const normalizedPath = path.posix.normalize(trimmedPath);
  if (
    normalizedPath === '.' ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }

  return normalizedPath;
}

export async function readSelectedQuestionFile({
  course,
  question,
  filePath,
}: {
  course: Course;
  question: Question;
  filePath: string | null;
}): Promise<SelectedQuestionFile | null> {
  if (filePath == null) return null;
  if (!question.qid) {
    throw new error.HttpStatusError(400, 'Question does not have a QID');
  }

  const questionPath = path.resolve(course.path, 'questions', question.qid);
  const fullPath = path.resolve(questionPath, filePath);
  if (!fullPath.startsWith(`${questionPath}${path.sep}`)) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }

  let stat: Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new error.HttpStatusError(404, 'Selected file not found');
    }
    throw err;
  }
  if (!stat.isFile()) {
    throw new error.HttpStatusError(400, 'Selected path is not a file');
  }

  const contents = await fs.readFile(fullPath);
  if (await isBinaryFile(contents)) {
    throw new error.HttpStatusError(400, 'Cannot edit binary file');
  }

  return {
    path: filePath,
    contents: b64EncodeUnicode(contents.toString('utf8')),
    aceMode: getModeForPath(filePath).mode,
  };
}

export function getEditorUrlWithSelectedFile({
  editorUrl,
  filePath,
}: {
  editorUrl: string;
  filePath: string;
}) {
  const params = new URLSearchParams({ file: filePath, tab: 'all-files' });
  return `${editorUrl}?${params.toString()}`;
}
