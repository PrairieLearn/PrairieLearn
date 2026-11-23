import { createHash } from 'node:crypto';
import * as path from 'node:path';

import async from 'async';
import fs from 'fs-extra';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { QuestionVersionSchema, type QuestionVersionSetting } from '../lib/db-types.js';
import { computeStableHash } from '../lib/json.js';
import type { CourseData } from '../sync/course-db.js';
import { getQuestionVersionSettings } from '../sync/fromDisk/questions.js';
import * as infofile from '../sync/infofile.js';

const sql = loadSqlEquiv(import.meta.url);

interface PendingQuestionVersion {
  question_id: string;
  source_hash: string;
  settings: Omit<QuestionVersionSetting, 'question_version_id'>;
}

/** Hash archive contents, including names, executable bits, empty directories, and symlink targets. */
async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relativePath: string) {
    const filePath = path.join(directory, relativePath);
    // tar follows its cwd, but preserves symlinks inside the archive.
    const stat = relativePath === '' ? await fs.stat(filePath) : await fs.lstat(filePath);
    const type = stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file';
    hash.update(
      JSON.stringify([relativePath, type, stat.mode & 0o777, stat.isFile() ? stat.size : null]),
    );
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(filePath)).sort()) {
        await visit(path.join(relativePath, name));
      }
    } else if (stat.isSymbolicLink()) {
      hash.update(JSON.stringify(await fs.readlink(filePath)));
    } else if (stat.isFile()) {
      for await (const data of fs.createReadStream(filePath)) hash.update(data);
    }
  }
  if (await fs.pathExists(directory)) await visit('');
  return hash.digest('hex');
}

// Administrative chunk regeneration does not sync identities before loading archives.
async function selectQuestionIdsForChunkRegeneration(courseId: string, courseData: CourseData) {
  const questions = await queryRows(
    sql.select_questions,
    { course_id: courseId },
    z.object({ id: IdSchema, qid: z.string(), uuid: z.string().nullable() }),
  );
  const ids = new Map<string, string>();
  for (const { id, qid, uuid } of questions) {
    if (
      Object.hasOwn(courseData.questions, qid) &&
      uuid === (courseData.questions[qid].uuid?.toLowerCase() ?? null)
    ) {
      ids.set(qid, id);
    }
  }
  return ids;
}

/** Must run under the course directory lock, before uploading any new archives. */
export async function prepareQuestionVersions({
  courseId,
  coursePath,
  courseData,
  questionIds,
  usesChunks,
}: {
  courseId: string;
  coursePath: string;
  courseData: CourseData;
  questionIds?: Record<string, string>;
  usesChunks: boolean;
}) {
  const idsByQid = questionIds
    ? new Map(Object.entries(questionIds))
    : await selectQuestionIdsForChunkRegeneration(courseId, courseData);
  const current = await queryRows(
    sql.select_current_versions,
    { course_id: courseId },
    QuestionVersionSchema.pick({
      id: true,
      question_id: true,
      source_hash: true,
      dependency_hash: true,
      uses_chunks: true,
    }).extend({ complete: z.boolean() }),
  );
  // Changed, invalid, and deleted questions all close their current version.
  // Remove versions from this map as we confirm they can stay open.
  const versionsToClose = new Map(current.map((version) => [version.question_id, version]));

  // A dependency-only publication must advance the pin date even if the question archive is unchanged.
  const dependencyHashes = await Promise.all(
    ['elements', 'elementExtensions', 'clientFilesCourse', 'serverFilesCourse'].map((name) =>
      hashDirectory(path.join(coursePath, name)),
    ),
  );
  const dependencyHash = computeStableHash(dependencyHashes);
  const fileHashes = new Map(
    await async.mapLimit(
      Object.keys(courseData.questions),
      10,
      async (qid: string) =>
        [qid, await hashDirectory(path.join(coursePath, 'questions', qid))] as const,
    ),
  );
  const versions: PendingQuestionVersion[] = [];
  const questionsToArchive = new Set<string>();
  for (const [qid, question] of Object.entries(courseData.questions)) {
    const questionId = idsByQid.get(qid);
    if (!questionId || !question.data || infofile.hasErrors(question)) continue;
    const settings = getQuestionVersionSettings(qid, question.data);
    const templateHashes = new Map<string, string | undefined>();
    let template = question.data.template;
    while (template && template !== qid && !templateHashes.has(template)) {
      templateHashes.set(template, fileHashes.get(template));
      template = courseData.questions[template]?.data?.template;
    }
    const sourceHash = computeStableHash([qid, settings, fileHashes.get(qid), [...templateHashes]]);
    const previous = versionsToClose.get(questionId);
    const sourceIsCurrent =
      previous?.source_hash === sourceHash &&
      previous.uses_chunks === usesChunks &&
      previous.complete;
    if (sourceIsCurrent && previous.dependency_hash === dependencyHash) {
      versionsToClose.delete(questionId);
      continue;
    }
    // A new version can keep using its question archive when only course dependencies changed.
    if (usesChunks && !sourceIsCurrent) questionsToArchive.add(qid);
    versions.push({
      question_id: questionId,
      source_hash: sourceHash,
      settings,
    });
  }
  const supersededIds = Array.from(versionsToClose.values(), ({ id }) => id);
  const archived = current.filter((version) => version.uses_chunks);
  // Refresh dependencies for a new archived baseline. Without a version to publish,
  // chunk generation can use its usual Git and missing-archive checks.
  const dependenciesChanged =
    usesChunks &&
    versions.length > 0 &&
    (archived.length === 0 ||
      archived.some((version) => version.dependency_hash !== dependencyHash));
  return {
    versions,
    supersededIds,
    usesChunks,
    dependencyHash,
    dependenciesChanged,
    questionsToArchive,
  };
}

/** Called inside the publication transaction, with the same timestamp as the chunks (when present). */
export async function writeQuestionVersions({
  publication,
  publishedAt,
  commitHash,
}: {
  publication: Awaited<ReturnType<typeof prepareQuestionVersions>>;
  publishedAt: string;
  commitHash: string | null;
}) {
  await execute(sql.supersede_versions, {
    version_ids: publication.supersededIds,
    published_at: publishedAt,
  });
  await execute(sql.insert_versions, {
    versions: JSON.stringify(publication.versions),
    published_at: publishedAt,
    commit_hash: commitHash,
    dependency_hash: publication.dependencyHash,
    uses_chunks: publication.usesChunks,
  });
}

/** Serialize publications and preserve database timestamp precision, including rapid repeated syncs. */
export async function beginQuestionVersionPublication(courseId: string) {
  await execute(sql.lock_course, { course_id: courseId });
  return await queryScalar(sql.select_publication_date, { course_id: courseId }, z.string());
}

export async function publishQuestionVersionsFromDisk(options: {
  courseId: string;
  coursePath: string;
  courseData: CourseData;
  questionIds: Record<string, string>;
  commitHash: string | null;
}) {
  const publication = await prepareQuestionVersions({ ...options, usesChunks: false });
  if (!publication.versions.length && !publication.supersededIds.length) return;
  await runInTransactionAsync(async () => {
    const publishedAt = await beginQuestionVersionPublication(options.courseId);
    await writeQuestionVersions({ publication, publishedAt, commitHash: options.commitHash });
  });
}
