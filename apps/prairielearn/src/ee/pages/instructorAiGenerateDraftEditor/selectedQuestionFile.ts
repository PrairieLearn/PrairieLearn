import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';

import * as error from '@prairielearn/error';

import type { Course, Question } from '../../../lib/db-types.js';
import { readEditableTextFile } from '../../../lib/editableFile.js';

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

export function getSelectedQuestionDirectory(queryValue: unknown): string | null {
  if (queryValue == null) return null;
  if (Array.isArray(queryValue)) {
    throw new error.HttpStatusError(400, 'Invalid selected directory');
  }
  if (typeof queryValue !== 'string') {
    throw new error.HttpStatusError(400, 'Invalid selected directory');
  }

  const trimmedPath = queryValue.trim();
  if (trimmedPath === '' || trimmedPath === '.') return null;

  return normalizeQuestionPath(trimmedPath, 'directory');
}

function normalizeQuestionPath(filePath: string, pathType: 'file' | 'directory'): string {
  const trimmedPath = filePath.trim();
  if (trimmedPath === '' || trimmedPath.includes('\0') || trimmedPath.includes('\\')) {
    throw new error.HttpStatusError(400, `Invalid selected ${pathType} path`);
  }

  const normalizedPath = path.posix.normalize(trimmedPath);
  if (
    normalizedPath === '.' ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    throw new error.HttpStatusError(400, `Invalid selected ${pathType} path`);
  }

  return normalizedPath;
}

export function normalizeQuestionFilePath(filePath: string): string {
  return normalizeQuestionPath(filePath, 'file');
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

  const editableFile = await readEditableTextFile({
    courseId: course.id,
    coursePath: course.path,
    fullPath,
    courseRelativePath: path.posix.join('questions', question.qid, filePath),
  });

  return {
    path: filePath,
    contents: editableFile.contents,
    aceMode: editableFile.aceMode,
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

export function getEditorUrlWithSelectedDirectory({
  editorUrl,
  directory,
}: {
  editorUrl: string;
  directory: string | null;
}) {
  const params = new URLSearchParams({ tab: 'all-files' });
  if (directory != null) params.set('dir', directory);
  return `${editorUrl}?${params.toString()}`;
}
