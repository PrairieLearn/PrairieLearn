import { b64EncodeUnicode } from '../base64-util.js';
import { getCourseFilesClient } from '../course-files-api.js';
import type { Course, Question, User } from '../db-types.js';
import {
  type Editor,
  FileDeleteEditor,
  FileRenameEditor,
  FileUploadEditor,
  runEditorJob,
} from '../editors.js';

import { getQuestionRootPath, requireQuestionQid, resolveWithinQuestionRoot } from './paths.js';

/**
 * Thrown when a draft question file edit fails to sync. Carries the
 * `jobSequenceId` so the caller can link to the job's logs. This is the only
 * error the mutation functions below raise on their own; each transport (tRPC,
 * the multipart upload route) translates it into its own error representation.
 */
export class EditJobFailedError extends Error {
  constructor(readonly jobSequenceId: string) {
    super('The file edit failed to sync.');
    this.name = 'EditJobFailedError';
  }
}

interface DraftQuestionFileMutationContext {
  course: Course;
  question: Question;
  user: User;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
}

/**
 * Runs an editor's server job, raising {@link EditJobFailedError} if it fails.
 * Editor failures are expected (e.g. a failed sync) rather than exceptional, so
 * `runEditorJob` reports them as a status that we translate here.
 */
async function runDraftEditorJob(editor: Editor): Promise<void> {
  const result = await runEditorJob(editor);
  if (result.status === 'error') {
    throw new EditJobFailedError(result.jobSequenceId);
  }
}

/**
 * Saves edits to a single draft question file.
 *
 * Unlike {@link deleteDraftQuestionFile}, {@link renameDraftQuestionFile}, and
 * {@link uploadDraftQuestionFile}, which run inline `File*Editor` jobs, this
 * routes through the `course-files-api` service — the same path the AI agent
 * uses to write question files. A content update maps cleanly onto
 * `updateQuestionFiles`; a file rename does not, so the two mechanisms can't be
 * collapsed into one.
 *
 * `filePath` is relative to the question root; callers validate it (e.g. via
 * `ModifiableQuestionFilePathSchema`) before calling.
 */
export async function saveDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  filePath,
  contents,
}: DraftQuestionFileMutationContext & {
  filePath: string;
  contents: string;
}): Promise<void> {
  const client = getCourseFilesClient();

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: user.id,
    authn_user_id: authn_user.id,
    question_id: question.id,
    has_course_permission_edit: authz_data.has_course_permission_edit,
    files: {
      [filePath]: b64EncodeUnicode(contents),
    },
  });

  if (result.status === 'error') {
    throw new EditJobFailedError(result.job_sequence_id);
  }
}

/** Deletes a draft question file. `filePath` is relative to the question root. */
export async function deleteDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  filePath,
}: DraftQuestionFileMutationContext & {
  filePath: string;
}): Promise<void> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  await runDraftEditorJob(
    new FileDeleteEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      deletePath: fullPath,
    }),
  );
}

/**
 * Renames (or moves) a draft question file. Both paths are relative to the
 * question root.
 */
export async function renameDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  oldFilePath,
  newFilePath,
}: DraftQuestionFileMutationContext & {
  oldFilePath: string;
  newFilePath: string;
}): Promise<void> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const oldPath = resolveWithinQuestionRoot(questionRootPath, oldFilePath);
  const newPath = resolveWithinQuestionRoot(questionRootPath, newFilePath);

  if (oldPath === newPath) return;

  await runDraftEditorJob(
    new FileRenameEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      oldPath,
      newPath,
    }),
  );
}

/** Uploads a draft question file. `filePath` is relative to the question root. */
export async function uploadDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  filePath,
  fileContents,
}: DraftQuestionFileMutationContext & {
  filePath: string;
  fileContents: Buffer;
}): Promise<void> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  await runDraftEditorJob(
    new FileUploadEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      filePath: fullPath,
      fileContents,
    }),
  );
}
