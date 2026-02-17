import * as path from 'path';

import fs from 'fs-extra';

import { b64EncodeUnicode } from './base64-util.js';
import type { Course, User } from './db-types.js';
import { FileModifyEditor, getOriginalHash } from './editors.js';
import type { InstructorFilePaths } from './instructorFiles.js';
import { formatJsonWithPrettier } from './prettier.js';

/**
 * Computes a hash of the infoCourseInstance.json file for optimistic concurrency.
 * Returns null if the file does not exist.
 */
export async function computeCourseInstanceJsonHash(
  courseInstanceJsonPath: string,
): Promise<string | null> {
  return await getOriginalHash(courseInstanceJsonPath);
}

/**
 * Reads and parses the infoCourseInstance.json file from a course instance directory.
 */
export async function readCourseInstanceJson(
  courseInstancePath: string,
): Promise<Record<string, unknown>> {
  const jsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
  return (await fs.readJson(jsonPath)) as Record<string, unknown>;
}

/**
 * Saves a modified infoCourseInstance.json file using the FileModifyEditor,
 * which handles git operations and sync.
 */
export async function saveCourseInstanceJson({
  courseInstanceJson,
  courseInstanceJsonPath,
  paths,
  origHash,
  locals,
}: {
  courseInstanceJson: Record<string, unknown>;
  courseInstanceJsonPath: string;
  paths: InstructorFilePaths;
  origHash: string;
  locals: { authz_data: Record<string, any>; course: Course; user: User };
}): Promise<{ success: true } | { success: false; error: string; jobSequenceId: string }> {
  const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

  const editor = new FileModifyEditor({
    locals,
    container: {
      rootPath: paths.rootPath,
      invalidRootPaths: paths.invalidRootPaths,
    },
    filePath: courseInstanceJsonPath,
    editContents: b64EncodeUnicode(formattedJson),
    origHash,
  });

  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    return {
      success: false,
      error: 'Failed to save course instance configuration',
      jobSequenceId: serverJob.jobSequenceId,
    };
  }

  return { success: true };
}
