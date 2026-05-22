import type { Course, Question, User } from '../db-types.js';
import { getOriginalHash } from '../editorUtil.js';
import {
  type Editor,
  FileDeleteEditor,
  FileModifyEditor,
  FileRenameEditor,
  FileUploadEditor,
  QuestionModifyEditor,
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

/**
 * Returns the content hash of a draft question file as it currently exists on
 * disk, or `null` if the file is missing. Callers compare this against the hash
 * the editor was opened with to detect a stale edit before saving.
 */
export async function getDraftQuestionFileHash({
  course,
  question,
  filePath,
}: {
  course: Course;
  question: Question;
  filePath: string;
}): Promise<string | null> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);
  return await getOriginalHash(fullPath);
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
 * Saves edits to a single draft question file via a `FileModifyEditor` job —
 * the same editor `instructorFileEditor` and the JSON settings editors use.
 *
 * `origHash` is the hash of the contents the editor was opened with (from
 * `readEditableTextFile`). `FileModifyEditor` rejects the save if the file on
 * disk no longer matches it, so a stale tab can't silently clobber another
 * writer's changes; callers that want to surface that as a typed conflict
 * should pre-check with {@link getDraftQuestionFileHash}.
 *
 * `filePath` is relative to the question root; callers validate it (e.g. via
 * `ModifiableQuestionFilePathSchema`) before calling. `encodedContents` is the
 * base64-encoded new file contents.
 */
export async function saveDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  filePath,
  encodedContents,
  origHash,
}: DraftQuestionFileMutationContext & {
  filePath: string;
  encodedContents: string;
  origHash: string;
}): Promise<void> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  await runDraftEditorJob(
    new FileModifyEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      filePath: fullPath,
      editContents: encodedContents,
      origHash,
    }),
  );
}

/**
 * Saves edits to one or more draft question files in a single atomic
 * `QuestionModifyEditor` job: every file is written — or deleted, when its
 * contents are `null` — in one git commit. This backs the question-code editor,
 * which edits `question.html` and `server.py` together and deletes `server.py`
 * when the user clears it.
 *
 * Unlike {@link saveDraftQuestionFile}, this has no stale-edit guard: the
 * question-code editor always holds the freshly-listed file contents, and
 * `QuestionModifyEditor` writes the whole question atomically.
 *
 * `files` maps question-relative paths to base64-encoded contents, or `null` to
 * delete the file. Callers validate the paths (e.g. via
 * `ModifiableQuestionFilePathSchema`) before calling.
 */
export async function saveDraftQuestionFiles({
  course,
  question,
  user,
  authn_user,
  authz_data,
  files,
}: DraftQuestionFileMutationContext & {
  files: Record<string, string | null>;
}): Promise<void> {
  await runDraftEditorJob(
    new QuestionModifyEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user, question },
      files,
    }),
  );
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
