import * as path from 'node:path';

import * as error from '@prairielearn/error';

import { type Editor, FileDeleteEditor, FileRenameEditor, FileUploadEditor } from './editors.js';
import type { InstructorFilePaths } from './instructorFiles.js';
import type { ResLocalsForPage } from './res-locals.js';
import type { ServerJobExecutor } from './server-jobs.js';

type CourseFileActionLocals = Pick<ResLocalsForPage<'course'>, 'authz_data' | 'course' | 'user'>;

type CourseFileActionResult =
  | { status: 'success'; jobSequenceId: string }
  | { status: 'error'; jobSequenceId: string };

type RenameCourseFileResult =
  | { status: 'unchanged'; newPath: string }
  | (CourseFileActionResult & { newPath: string });

interface UploadedCourseFile {
  originalname: string;
  buffer: Buffer;
}

type UploadCourseFileDestination =
  | { destinationFilePath: string; destinationDirectory?: never }
  | { destinationFilePath?: undefined; destinationDirectory: string };

export function getSuccessfulActionRedirectUrl({
  redirectUrl,
  urlPrefix,
}: {
  redirectUrl: string | undefined;
  urlPrefix: string;
}) {
  if (redirectUrl == null || redirectUrl.trim() === '') return null;
  if (!redirectUrl.startsWith(`${urlPrefix}/`)) {
    throw new error.HttpStatusError(400, 'Invalid redirect URL');
  }
  return redirectUrl;
}

function getEditorContainer(paths: InstructorFilePaths) {
  return {
    rootPath: paths.rootPath,
    invalidRootPaths: paths.invalidRootPaths,
  };
}

async function executeEditorAction(editor: Editor): Promise<CourseFileActionResult> {
  const serverJob: ServerJobExecutor = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    return {
      status: 'error',
      jobSequenceId: serverJob.jobSequenceId,
    };
  }

  return {
    status: 'success',
    jobSequenceId: serverJob.jobSequenceId,
  };
}

export async function deleteCourseFile({
  locals,
  paths,
  filePath,
}: {
  locals: CourseFileActionLocals;
  paths: InstructorFilePaths;
  filePath: string;
}): Promise<CourseFileActionResult> {
  let deletePath: string;
  try {
    deletePath = path.join(locals.course.path, filePath);
  } catch {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  return executeEditorAction(
    new FileDeleteEditor({
      locals,
      container: getEditorContainer(paths),
      deletePath,
    }),
  );
}

export async function renameCourseFile({
  locals,
  paths,
  workingPath,
  oldFileName,
  newFileName,
}: {
  locals: CourseFileActionLocals;
  paths: InstructorFilePaths;
  workingPath: string;
  oldFileName: string;
  newFileName: string;
}): Promise<RenameCourseFileResult> {
  let oldPath: string;
  try {
    oldPath = path.join(workingPath, oldFileName);
  } catch {
    throw new Error(`Invalid old file path: ${workingPath} / ${oldFileName}`);
  }
  if (!newFileName) {
    throw new Error(`Invalid new file name (was falsy): ${newFileName}`);
  }
  if (
    !/^(?:[-A-Za-z0-9_]+|\.\.)(?:\/(?:[-A-Za-z0-9_]+|\.\.))*(?:\.[-A-Za-z0-9_]+)?$/.test(
      newFileName,
    )
  ) {
    throw new Error(`Invalid new file name (did not match required pattern): ${newFileName}`);
  }

  let newPath: string;
  try {
    newPath = path.join(workingPath, newFileName);
  } catch {
    throw new Error(`Invalid new file path: ${workingPath} / ${newFileName}`);
  }

  if (oldPath === newPath) {
    return {
      status: 'unchanged',
      newPath,
    };
  }

  return {
    ...(await executeEditorAction(
      new FileRenameEditor({
        locals,
        container: getEditorContainer(paths),
        oldPath,
        newPath,
      }),
    )),
    newPath,
  };
}

export async function uploadCourseFile({
  locals,
  paths,
  file,
  destinationFilePath,
  destinationDirectory,
}: {
  locals: CourseFileActionLocals;
  paths: InstructorFilePaths;
  file: UploadedCourseFile;
} & UploadCourseFileDestination): Promise<CourseFileActionResult> {
  let resolvedFilePath: string;
  if (destinationFilePath != null) {
    try {
      resolvedFilePath = path.join(locals.course.path, destinationFilePath);
    } catch {
      throw new Error(`Invalid file path: ${destinationFilePath}`);
    }
  } else {
    try {
      resolvedFilePath = path.join(destinationDirectory, file.originalname);
    } catch {
      throw new Error(`Invalid file path: ${destinationDirectory} / ${file.originalname}`);
    }
  }

  return executeEditorAction(
    new FileUploadEditor({
      locals,
      container: getEditorContainer(paths),
      filePath: resolvedFilePath,
      fileContents: file.buffer,
    }),
  );
}
