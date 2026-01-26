import * as path from 'path';

import fs from 'fs-extra';

import { b64EncodeUnicode } from './base64-util.js';
import { FileModifyEditor } from './editors.js';
import { getPaths } from './instructorFiles.js';
import { formatJsonWithPrettier } from './prettier.js';

/**
 * Reads the infoCourseInstance.json file and returns the parsed JSON.
 */
export async function readCourseInstanceJson(
  courseInstancePath: string,
): Promise<Record<string, unknown>> {
  const jsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
  const content = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(content);
}

interface SaveCourseInstanceJsonParams {
  courseInstanceJson: Record<string, unknown>;
  courseInstanceJsonPath: string;
  paths: ReturnType<typeof getPaths>;
  origHash: string;
  locals: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authz_data: Record<string, any>;
    course: { path: string };
    user: { id: string };
  };
}

interface SaveResult {
  success: true;
}

interface SaveError {
  success: false;
  error: string;
  jobSequenceId: string;
}

/**
 * Saves the course instance JSON using FileModifyEditor.
 * Returns a result object indicating success or failure with error details.
 */
export async function saveCourseInstanceJson({
  courseInstanceJson,
  courseInstanceJsonPath,
  paths,
  origHash,
  locals,
}: SaveCourseInstanceJsonParams): Promise<SaveResult | SaveError> {
  const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = new FileModifyEditor({
    locals: locals as any,
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
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save changes',
      jobSequenceId: serverJob.jobSequenceId,
    };
  }
}
