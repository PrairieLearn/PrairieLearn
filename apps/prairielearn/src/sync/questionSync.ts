import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';
import fs from 'fs-extra';
import { z } from 'zod';

import { contains } from '@prairielearn/path-utils';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type Course, QuestionSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { selectInstitutionForCourse } from '../models/institution.js';
import { selectSharingSetsForQuestion } from '../models/sharing-set.js';
import { selectTagsByQuestionId } from '../models/tags.js';
import { selectTopicsByCourseId } from '../models/topics.js';
import { type QuestionJson, QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { loadInfoFile, loadQuestionInfo } from './course-db.js';
import { type InfoFile } from './infofile.js';

const sql = loadSqlEquiv(import.meta.url);

export type QuestionSyncChange =
  | { kind: 'content'; qid: string }
  | { kind: 'title'; qid: string; title: string }
  | { kind: 'recover'; qid: string; info: InfoFile<QuestionJson> };

/** Requires the course lock and final checkout. Returns null when changes require full sync. */
export async function getQuestionSyncPlan({
  course,
  oldHash,
  newHash,
  editedPaths = [],
}: {
  course: Course;
  oldHash: string | null;
  newHash: string;
  editedPaths?: string[];
}): Promise<QuestionSyncChange[] | null> {
  if (!oldHash) return null;
  const institution = await selectInstitutionForCourse({ course_id: course.id });
  if (
    !(await features.enabled('partial-course-sync', {
      course_id: course.id,
      institution_id: institution.id,
    }))
  ) {
    return null;
  }
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

  // Git mode 120000 identifies symlinks, which can redirect content edits into metadata.
  const { stdout: trackedFiles } = await execa('git', ['ls-files', '--stage', '-z', '--', '.'], {
    cwd: course.path,
  });
  if (trackedFiles.split('\0').some((entry) => entry.startsWith('120000 '))) return null;

  const rows = await queryRows(
    sql.select_questions_for_files,
    { course_id: course.id, file_paths: [...files] },
    z.object({ file_path: z.string(), question: QuestionSchema.nullable() }),
  );
  const plan = new Map<string, QuestionSyncChange>();
  const realCoursePath = await fs.realpath(course.path);
  for (const { file_path: file, question } of rows) {
    if (!question?.qid) return null;
    const absolutePath = path.join(course.path, file);
    if (!contains(course.path, absolutePath)) return null;
    if (await fs.pathExists(absolutePath)) {
      if ((await fs.realpath(absolutePath)) !== path.join(realCoursePath, file)) return null;
      if (!(await fs.lstat(absolutePath)).isFile()) return null;
    }
    if (file === `questions/${question.qid}/info.json`) {
      const original = await execa('git', ['show', `${oldHash}:./${file}`], {
        cwd: course.path,
        reject: false,
      });
      if (original.exitCode !== 0) return null;
      let previous: unknown;
      try {
        previous = JSON.parse(original.stdout);
      } catch {
        return null;
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(previous);
      if (!parsed.success) return null;
      if (question.sync_errors) {
        const info = await loadQuestionInfo(course.id, course.path, question.qid);
        if (!info || !question.uuid || info.uuid?.toLowerCase() !== question.uuid.toLowerCase()) {
          return null;
        }
        // Even unapplied preferences in the failed file can leave errors on assessments.
        // Use full sync until those assessments can be revalidated selectively.
        if (
          question.preferences_schema != null ||
          info.data?.preferences != null ||
          parsed.data.preferences != null
        ) {
          return null;
        }
        if (info.data) {
          const sharingSets = await selectSharingSetsForQuestion({
            course_id: course.id,
            question_id: question.id,
          });
          // Validation errors must not bypass the pre-push sharing checks.
          if (
            info.data.sharePublicly !== question.share_publicly ||
            info.data.shareSourcePublicly !== question.share_source_publicly ||
            info.data.sharingSets?.length ||
            sharingSets.some((set) => set.in_set)
          ) {
            return null;
          }
        }
        if (info.data && info.errors.length === 0) {
          const [tags, topics] = await Promise.all([
            selectTagsByQuestionId(question.id),
            selectTopicsByCourseId(course.id),
          ]);
          // Catalog changes use their own sync paths. Recovery here only
          // reapplies metadata whose external dependencies are unchanged.
          if (
            !isDeepStrictEqual(new Set(tags.map((tag) => tag.name)), new Set(info.data.tags)) ||
            topics.find((topic) => topic.id === question.topic_id)?.name !== info.data.topic
          ) {
            return null;
          }
        }
        plan.set(question.qid, { kind: 'recover', qid: question.qid, info });
        continue;
      }
      const loaded = await loadInfoFile<Record<string, unknown>>({
        coursePath: course.path,
        filePath: file,
      });
      if (!loaded?.data || loaded.errors.length > 0) return null;
      const validated = QuestionJsonSchema.safeParse(loaded.data);
      if (!validated.success) return null;
      const { title: _oldTitle, ...oldMetadata } = parsed.data;
      const { title: _newTitle, ...newMetadata } = loaded.data;
      if (!isDeepStrictEqual(oldMetadata, newMetadata)) return null;
      plan.set(question.qid, { kind: 'title', qid: question.qid, title: validated.data.title });
    } else if (!plan.has(question.qid)) {
      plan.set(question.qid, { kind: 'content', qid: question.qid });
    }
  }
  return [...plan.values()];
}
