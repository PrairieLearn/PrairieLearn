import crypto from 'node:crypto';
import * as path from 'path';

import fs from 'fs-extra';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode } from './base64-util.js';
import { type FileDetails, type FileMetadata, FileType } from './editorUtil.shared.js';
import { computeStableHash } from './json.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Structural type matching the subset of `res.locals` (or an equivalent context
 * object) needed to locate an assessment's files on disk.
 */
interface AssessmentLocation {
  course: { path: string };
  course_instance: { short_name: string | null };
  assessment: { tid: string | null };
}

/**
 * Returns the absolute filesystem path to an assessment's directory under its
 * course (`{course.path}/courseInstances/{short_name}/assessments/{tid}`).
 */
export function getAssessmentDir(loc: AssessmentLocation): string {
  return path.join(
    loc.course.path,
    'courseInstances',
    loc.course_instance.short_name!,
    'assessments',
    loc.assessment.tid!,
  );
}

/**
 * Returns the absolute filesystem path to an assessment's `infoAssessment.json`.
 */
export function getAssessmentInfoJsonPath(loc: AssessmentLocation): string {
  return path.join(getAssessmentDir(loc), 'infoAssessment.json');
}

export function computeFileContentHash(contents: string): string {
  return crypto.createHash('sha256').update(b64EncodeUnicode(contents)).digest('hex');
}

export async function getOriginalHash(filePath: string) {
  try {
    return computeFileContentHash(await fs.readFile(filePath, 'utf8'));
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Returns true if `relPath` (relative to the course root) is a `question.html`
 * file inside a v3 question's directory, as determined by reading the sibling
 * `info.json`.
 */
export async function isV3QuestionHtmlFile(coursePath: string, relPath: string): Promise<boolean> {
  const components = path.normalize(relPath).split(path.posix.sep);
  if (components.length < 3) return false;
  if (components[0] !== 'questions') return false;
  if (components.at(-1) !== 'question.html') return false;

  const infoPath = path.join(coursePath, ...components.slice(0, -1), 'info.json');
  try {
    const info = await fs.readJson(infoPath);
    return info?.type === 'v3';
  } catch {
    return false;
  }
}

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
