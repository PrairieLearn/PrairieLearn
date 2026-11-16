import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { z } from 'zod';

import { contains } from '@prairielearn/path-utils';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type Course, QuestionSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** Requires the course lock and a checkout restored to the final revision. */
export async function getQuestionContentPlan({
  course,
  oldHash,
  newHash,
  editedPaths = [],
}: {
  course: Course;
  oldHash: string | null;
  newHash: string;
  editedPaths?: string[];
}): Promise<string[] | null> {
  if (!oldHash) return null;
  const diff = await execa(
    'git',
    ['diff', '--relative', '--no-renames', '--name-status', '-z', oldHash, newHash, '--', '.'],
    { cwd: course.path, reject: false },
  );
  if (diff.exitCode !== 0) return null;

  const files = new Set<string>();
  const changes = diff.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < changes.length; index += 2) {
    if (!['M', 'A', 'D'].includes(changes[index])) return null;
    files.add(changes[index + 1]);
  }
  // A reverted edit can have an empty net diff but still need reconciliation.
  for (const file of editedPaths) {
    if (!contains(course.path, file)) return null;
    files.add(path.relative(course.path, file));
  }
  if (files.size === 0) return [];
  if ([...files].some((file) => !file.startsWith('questions/'))) return null;

  // A metadata symlink can make a content edit affect metadata elsewhere.
  const { stdout: trackedFiles } = await execa('git', ['ls-files', '--stage', '-z', '--', '.'], {
    cwd: course.path,
  });
  if (trackedFiles.split('\0').some((entry) => entry.startsWith('120000 '))) return null;

  const rows = await queryRows(
    sql.select_questions_for_files,
    { course_id: course.id, file_paths: [...files] },
    z.object({ file_path: z.string(), question: QuestionSchema.nullable() }),
  );
  const qids = new Set<string>();
  const realCoursePath = await fs.realpath(course.path);
  for (const { file_path: file, question } of rows) {
    if (!question?.qid || file === `questions/${question.qid}/info.json`) return null;
    const absolutePath = path.join(course.path, file);
    if (!contains(course.path, absolutePath)) return null;
    if (await fs.pathExists(absolutePath)) {
      if ((await fs.realpath(absolutePath)) !== path.join(realCoursePath, file)) return null;
      if (!(await fs.lstat(absolutePath)).isFile()) return null;
    }
    qids.add(question.qid);
  }
  return [...qids];
}
