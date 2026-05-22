/**
 * Draft question file mutations.
 *
 * Architecture note: every mutation here runs an `Editor` in-process, writing
 * directly to the course's git repository on the local filesystem — and the
 * file reads in `./browser.ts` assume the same. This is correct only while the
 * chunk server and the file storage server are co-located on the "main" server,
 * and it matches the in-process editor pattern of `instructorFileEditor` and
 * `instructorFileBrowser`. When file storage is split out, these (and those
 * sibling pages) must move behind the course-files API. See
 * PrairieLearnInc/sysconf#1487.
 */
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
 * The typed `SYNC_JOB_FAILED` app-error payload for a failed edit job. The
 * `aiDraftFiles` tRPC error formatter and the multipart upload route both build
 * their error responses from this, so the wire shape stays defined in one place.
 * `message` defaults to the generic edit-failure message; pass an
 * operation-specific one (e.g. for an upload or a rename) when it helps the user.
 */
export function editJobFailedAppError(
  err: EditJobFailedError,
  message: string = err.message,
): { code: 'SYNC_JOB_FAILED'; message: string; jobSequenceId: string } {
  return { code: 'SYNC_JOB_FAILED', message, jobSequenceId: err.jobSequenceId };
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
 * Builds the `locals` slice the file `Editor` classes require, threading
 * `authn_user` into `authz_data` the way the editors expect.
 */
function editorLocals({
  course,
  user,
  authn_user,
  authz_data,
}: Pick<DraftQuestionFileMutationContext, 'course' | 'user' | 'authn_user' | 'authz_data'>) {
  return { authz_data: { ...authz_data, authn_user }, course, user };
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
      locals: editorLocals({ course, user, authn_user, authz_data }),
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
 * TODO: this leaves the code-editor surface with no conflict contract. The
 * "freshly-listed contents" assumption holds within a single tab, but a
 * concurrent writer — another tab, or the agent racing a manual save — is
 * silently clobbered, and the payload rewrites both files even when only one
 * changed. {@link saveDraftQuestionFile} guards against this with `origHash`;
 * closing the gap would mean threading per-file content hashes through here.
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
      locals: { ...editorLocals({ course, user, authn_user, authz_data }), question },
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
      locals: editorLocals({ course, user, authn_user, authz_data }),
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
      locals: editorLocals({ course, user, authn_user, authz_data }),
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
      locals: editorLocals({ course, user, authn_user, authz_data }),
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      filePath: fullPath,
      fileContents,
    }),
  );
}
