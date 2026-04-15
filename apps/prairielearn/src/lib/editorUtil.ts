import * as path from 'path';

import fs from 'fs-extra';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import type { AuthzData } from './authz-data-lib.js';
import { b64EncodeUnicode } from './base64-util.js';
import type { Course, User } from './db-types.js';
import { type FileDetails, type FileMetadata, FileType } from './editorUtil.shared.js';
import { FileModifyEditor, computeFileContentHash } from './editors.js';
import { computeStableHash } from './json.js';
import { formatJsonWithPrettier } from './prettier.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export function getDetailsForFile(filePath: string): FileDetails {
  const normalizedPath = path.normalize(filePath);
  const pathComponents = normalizedPath.split(path.posix.sep);
  if (pathComponents.length === 1 && pathComponents[0] === 'infoCourse.json') {
    return { type: FileType.Course };
  } else if (
    pathComponents.length >= 3 &&
    pathComponents[0] === 'courseInstances' &&
    pathComponents.at(-1) === 'infoCourseInstance.json'
  ) {
    const ciid = pathComponents.slice(1, -1).join(path.posix.sep);
    return { type: FileType.CourseInstance, ciid };
  } else if (
    pathComponents.length >= 3 &&
    pathComponents[0] === 'questions' &&
    pathComponents.at(-1) === 'info.json'
  ) {
    const qid = pathComponents.slice(1, -1).join(path.posix.sep);
    return { type: FileType.Question, qid };
  } else if (
    pathComponents.length >= 5 &&
    pathComponents[0] === 'courseInstances' &&
    pathComponents.slice(2, -2).includes('assessments') &&
    pathComponents.at(-1) === 'infoAssessment.json'
  ) {
    const assessment_index = pathComponents.slice(2, -2).indexOf('assessments') + 2;
    const ciid = pathComponents.slice(1, assessment_index).join(path.posix.sep);
    const aid = pathComponents.slice(assessment_index + 1, -1).join(path.posix.sep);
    return { type: FileType.Assessment, ciid, aid };
  } else {
    return { type: FileType.File };
  }
}

/**
 * Get the metadata for a file at a given path. This information is displayed to the user
 * in the file editor.
 * @param courseId - The ID of the course.
 * @param filePath - The path to the file.
 * @returns The metadata for the file.
 */
export async function getFileMetadataForPath(
  courseId: any,
  filePath: string,
): Promise<FileMetadata> {
  const details = getDetailsForFile(filePath);
  let query: string | null = null;
  const queryParams: Record<string, any> = { course_id: courseId };
  switch (details.type) {
    case FileType.Course:
      query = sql.select_file_metadata_for_course;
      break;
    case FileType.Question:
      query = sql.select_file_metadata_for_question;
      queryParams.qid = details.qid;
      break;
    case FileType.CourseInstance:
      query = sql.select_file_metadata_for_course_instance;
      queryParams.ciid = details.ciid;
      break;
    case FileType.Assessment:
      query = sql.select_file_metadata_for_assessment;
      queryParams.ciid = details.ciid;
      queryParams.aid = details.aid;
      break;
    default:
      return { syncErrors: null, syncWarnings: null, uuid: null, type: FileType.File };
  }

  const res = await sqldb.queryOptionalRow(
    query,
    queryParams,
    z.object({
      sync_errors: z.string().nullable(),
      sync_warnings: z.string().nullable(),
      uuid: z.string().nullable(),
    }),
  );
  if (res === null) {
    return { syncErrors: null, syncWarnings: null, uuid: null, type: details.type };
  }
  return {
    syncErrors: res.sync_errors,
    syncWarnings: res.sync_warnings,
    uuid: res.uuid,
    type: details.type,
  };
}

type SaveJsonFileResult =
  | {
      success: true;
      /** Hash of the scoped section after the write, or full-file hash when no scope is provided. */
      newHash: string;
    }
  | { success: false; reason: 'conflict' }
  | { success: false; reason: 'sync_failed'; jobSequenceId: string };

/**
 * Computes a stable hash of a scoped section of a JSON file. The generic type
 * parameter should be the Zod input type for the file's schema so that the
 * `scope` callback gets full type safety.
 *
 * @returns The hash string, or `null` if the file does not exist.
 */
export async function computeScopedJsonHash<T extends Record<string, unknown>>(
  jsonPath: string,
  scope: (json: T) => unknown,
): Promise<string | null> {
  try {
    const json = (await fs.readJson(jsonPath)) as T;
    return computeStableHash(scope(json));
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveJsonFile<T extends Record<string, unknown>>({
  applyChanges,
  jsonPath,
  conflictCheck,
  locals,
  container,
}: {
  applyChanges: (jsonContents: T) => T;
  jsonPath: string;
  conflictCheck: {
    origHash: string | null;
    scope: (jsonContents: T) => unknown;
  };
  locals: { authz_data: AuthzData; course: Course; user: User };
  container: { rootPath: string; invalidRootPaths: string[] };
}): Promise<SaveJsonFileResult> {
  // Read file once for conflict check, content modification, and TOCTOU hash.
  const rawContents = await fs.readFile(jsonPath, 'utf8');
  const fullFileHash = computeFileContentHash(rawContents);
  const jsonContents = JSON.parse(rawContents) as T;

  // Scoped conflict detection: hash only the section being edited.
  if (conflictCheck.origHash) {
    const currentHash = computeStableHash(conflictCheck.scope(jsonContents));
    if (currentHash !== conflictCheck.origHash) {
      return { success: false, reason: 'conflict' };
    }
  }

  const modifiedJsonContents = applyChanges(jsonContents);
  const formattedJson = await formatJsonWithPrettier(JSON.stringify(modifiedJsonContents));

  // Use the full-file hash for FileModifyEditor's TOCTOU safety net.
  const editor = new FileModifyEditor({
    locals,
    container,
    filePath: jsonPath,
    editContents: b64EncodeUnicode(formattedJson),
    origHash: fullFileHash,
  });

  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    return { success: false, reason: 'sync_failed', jobSequenceId: serverJob.jobSequenceId };
  }

  const newHash = computeStableHash(conflictCheck.scope(modifiedJsonContents));
  return { success: true, newHash };
}
