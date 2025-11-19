import * as path from 'path';

import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type FileDetails, type FileMetadata, FileType } from './editorUtil.types.js';

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
