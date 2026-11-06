import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';
import fs from 'fs-extra';

import { contains } from '@prairielearn/path-utils';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { type Course, QuestionSchema } from '../lib/db-types.js';
import { QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { loadInfoFile } from './course-db.js';
import { CURRENT_SYNC_VERSION } from './version.js';

const sql = loadSqlEquiv(import.meta.url);

export interface QuestionSyncScope {
  kind: 'content' | 'title';
  qid: string;
  relativeFilePath: string;
}

export type QuestionSyncChange =
  | (QuestionSyncScope & { kind: 'content' })
  | (QuestionSyncScope & { kind: 'title'; title: string });

/** Called under the course lock, before invalidating the previous sync state. */
export async function getQuestionSyncScope(
  course: Course,
  filePath: string,
  currentHash: string,
): Promise<QuestionSyncScope | null> {
  const previous = course.last_successful_sync;
  if (
    previous?.commitHash !== currentHash ||
    previous.commitHash !== course.commit_hash ||
    previous.version !== CURRENT_SYNC_VERSION ||
    previous.chunksGenerated !== config.chunksGenerator
  ) {
    return null;
  }

  const relativeFilePath = path.relative(course.path, filePath);
  const parts = relativeFilePath.split(path.sep);
  if (parts[0] !== 'questions' || !contains(course.path, filePath)) return null;

  const qids = parts.slice(1, -1).map((_, index) => parts.slice(1, index + 2).join('/'));
  const question = await queryOptionalRow(
    sql.select_question_for_file,
    { course_id: course.id, qids },
    QuestionSchema,
  );
  if (!question?.qid) return null;

  const kind =
    relativeFilePath === path.join('questions', question.qid, 'info.json') ? 'title' : 'content';

  // Symlinked content could alias a metadata file despite a content-looking path.
  const realCoursePath = await fs.realpath(course.path);
  const realFilePath = await fs.realpath(filePath);
  if (realFilePath !== path.join(realCoursePath, relativeFilePath)) return null;
  if (!(await fs.lstat(filePath)).isFile()) return null;

  return { kind, qid: question.qid, relativeFilePath };
}

/** Verify that checkout resets, hooks, or other changes did not widen the operation. */
export async function getVerifiedQuestionChange({
  coursePath,
  oldHash,
  newHash,
  scope,
}: {
  coursePath: string;
  oldHash: string;
  newHash: string;
  scope: QuestionSyncScope;
}): Promise<QuestionSyncChange | null> {
  if (oldHash === newHash) return null;
  // A metadata symlink elsewhere in the course could read the edited content file.
  const { stdout: trackedFiles } = await execa('git', ['ls-files', '--stage', '-z', '--', '.'], {
    cwd: coursePath,
  });
  if (trackedFiles.split('\0').some((entry) => entry.startsWith('120000 '))) return null;
  const { stdout } = await execa(
    'git',
    ['diff', '--relative', '--no-renames', '--name-status', '-z', oldHash, newHash, '--', '.'],
    { cwd: coursePath },
  );
  const changes = stdout.split('\0');
  if (changes.length !== 3 || changes[0] !== 'M' || changes[1] !== scope.relativeFilePath) {
    return null;
  }
  if (scope.kind === 'content') return { ...scope, kind: 'content' };

  const loaded = await loadInfoFile<Record<string, unknown>>({
    coursePath,
    filePath: scope.relativeFilePath,
  });
  if (!loaded?.data || loaded.errors.length > 0) return null;
  const title = QuestionJsonSchema.shape.title.safeParse(loaded.data.title);
  if (!title.success) return null;

  const { stdout: original } = await execa(
    'git',
    ['show', `${oldHash}:./${scope.relativeFilePath}`],
    { cwd: coursePath },
  );
  // The baseline guarantees that unchanged metadata has already passed full sync.
  const { title: oldTitle, ...oldMetadata } = JSON.parse(original) as Record<string, unknown>;
  const { title: newTitle, ...newMetadata } = loaded.data;
  if (oldTitle === newTitle || !isDeepStrictEqual(oldMetadata, newMetadata)) return null;
  return { ...scope, kind: 'title', title: title.data };
}
