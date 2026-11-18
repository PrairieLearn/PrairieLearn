import { createHash } from 'node:crypto';
import * as path from 'node:path';

import async from 'async';
import stringify from 'fast-json-stable-stringify';
import fs from 'fs-extra';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  ChunkSchema,
  QuestionVersionSchema,
  type QuestionVersionSetting,
  QuestionVersionSettingSchema,
} from '../lib/db-types.js';
import type { CourseData } from '../sync/course-db.js';
import { getQuestionVersionSettings } from '../sync/fromDisk/questions.js';
import * as infofile from '../sync/infofile.js';

const sql = loadSqlEquiv(import.meta.url);

interface PendingQuestionVersion {
  question_id: string;
  qid: string;
  source_hash: string;
  dependency_hash: string;
  settings: Omit<QuestionVersionSetting, 'question_version_id'>;
}

/** Hash archive contents, including names, executable bits, empty directories, and symlink targets. */
async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relativePath: string) {
    const filePath = path.join(directory, relativePath);
    const stat = await fs.lstat(filePath);
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

/** Must run under the course directory lock, before uploading any new archives. */
export async function prepareQuestionVersions({
  courseId,
  coursePath,
  courseData,
  usesChunks,
}: {
  courseId: string;
  coursePath: string;
  courseData: CourseData;
  usesChunks: boolean;
}) {
  const questions = await queryRows(
    sql.select_questions,
    { course_id: courseId },
    z.object({ id: IdSchema, qid: z.string(), uuid: z.string().nullable() }),
  );
  const questionsByQid = new Map(questions.map((question) => [question.qid, question]));
  const current = await queryRows(
    sql.select_current_versions,
    { course_id: courseId },
    z.object({
      question_version: QuestionVersionSchema,
      has_settings: z.boolean(),
      has_chunk: z.boolean(),
    }),
  );
  const currentByQuestionId = new Map(
    current.map((row) => [row.question_version.question_id, row]),
  );

  // A dependency-only publication must advance the pin date even if the question archive is unchanged.
  const dependencyHashes = await Promise.all(
    ['elements', 'elementExtensions', 'clientFilesCourse', 'serverFilesCourse'].map((name) =>
      hashDirectory(path.join(coursePath, name)),
    ),
  );
  const dependencyHash = createHash('sha256').update(stringify(dependencyHashes)).digest('hex');
  const dependenciesChanged =
    !current.some(({ question_version }) => question_version.uses_chunks) ||
    current.some(
      ({ question_version }) =>
        question_version.uses_chunks && question_version.dependency_hash !== dependencyHash,
    );
  const fileHashes = new Map(
    await async.mapLimit(
      Object.keys(courseData.questions),
      10,
      async (qid: string) =>
        [qid, await hashDirectory(path.join(coursePath, 'questions', qid))] as const,
    ),
  );
  const versions: PendingQuestionVersion[] = [];
  const validQuestionIds = new Set<string>();
  for (const [qid, question] of Object.entries(courseData.questions)) {
    const identity = questionsByQid.get(qid);
    // Chunk regeneration can load disk without syncing identities first. Do not attach a new UUID's files to an old ID.
    if (
      !identity ||
      identity.uuid !== question.uuid?.toLowerCase() ||
      !question.data ||
      infofile.hasErrors(question)
    ) {
      continue;
    }
    const settings = getQuestionVersionSettings(qid, question.data);
    const templates: string[] = [];
    const seen = new Set([qid]);
    let template = question.data.template;
    while (template && !seen.has(template)) {
      seen.add(template);
      templates.push(template);
      template = courseData.questions[template]?.data?.template;
    }
    const sourceHash = createHash('sha256')
      .update(
        stringify([
          qid,
          settings,
          fileHashes.get(qid),
          dependencyHash,
          templates.map((name) => [name, fileHashes.get(name)]),
        ]),
      )
      .digest('hex');
    validQuestionIds.add(identity.id);
    const previous = currentByQuestionId.get(identity.id);
    if (
      previous?.question_version.source_hash === sourceHash &&
      previous.question_version.uses_chunks === usesChunks &&
      previous.has_settings &&
      (!usesChunks || previous.has_chunk)
    ) {
      continue;
    }
    versions.push({
      question_id: identity.id,
      qid,
      source_hash: sourceHash,
      dependency_hash: dependencyHash,
      settings,
    });
  }
  const changedQuestionIds = new Set(versions.map((version) => version.question_id));
  const supersededIds = current
    .filter(
      ({ question_version }) =>
        !validQuestionIds.has(question_version.question_id) ||
        changedQuestionIds.has(question_version.question_id),
    )
    .map(({ question_version }) => question_version.id);
  return { versions, supersededIds, usesChunks, dependenciesChanged };
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
  commitHash: string | null;
}) {
  const publication = await prepareQuestionVersions({ ...options, usesChunks: false });
  await runInTransactionAsync(async () => {
    const publishedAt = await beginQuestionVersionPublication(options.courseId);
    await writeQuestionVersions({ publication, publishedAt, commitHash: options.commitHash });
  });
}

const QuestionVersionAtDateSchema = z.object({
  question_version: QuestionVersionSchema,
  settings: QuestionVersionSettingSchema.nullable(),
  chunk: ChunkSchema.nullable(),
  version_date: z.string(),
});

class QuestionHistoryUnavailableError extends Error {
  constructor(questionId: string, atDate: string) {
    super(`Question history is unavailable for question ${questionId} at ${atDate}.`);
    this.name = 'QuestionHistoryUnavailableError';
  }
}

/**
 * Selects a version and its own settings, including renamed or soft-deleted questions.
 * Pass database timestamps as strings to preserve microsecond precision. `version_date`
 * preserves that precision for resolving other course dependencies at the same publication.
 * Returns null outside recorded validity intervals; throws for incomplete history.
 * Local versions have no chunk: their files are read from the course directory.
 * This lookup does not authorize access or load historical runtime files.
 */
export async function selectOptionalQuestionVersionAtDate({
  question_id,
  at_date,
}: {
  question_id: string;
  at_date: string;
}) {
  const result = await queryOptionalRow(
    sql.select_question_version_at_date,
    { question_id, at_date },
    QuestionVersionAtDateSchema,
  );
  if (!result) return null;
  if (result.settings === null || (result.question_version.uses_chunks && result.chunk === null)) {
    throw new QuestionHistoryUnavailableError(question_id, at_date);
  }
  return {
    question_version: result.question_version,
    settings: result.settings,
    chunk: result.chunk,
    version_date: result.version_date,
  };
}
