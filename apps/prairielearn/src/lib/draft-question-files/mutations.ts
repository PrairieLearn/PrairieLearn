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
import { HttpStatusError } from '@prairielearn/error';

import { selectQuestionById } from '../../models/question.js';
import { getCourseFilesClient } from '../course-files-api.js';
import type { Course, Question, User } from '../db-types.js';
import {
  type Editor,
  FileDeleteEditor,
  FileRenameEditor,
  FileUploadEditor,
  QuestionModifyEditor,
  runEditorJob,
} from '../editors.js';
import { validateShortName } from '../short-name.js';

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
 * The context the mutations need, with `authz_data` in the shape the file
 * `Editor` classes expect (`res.locals.authz_data` satisfies it directly).
 */
interface DraftQuestionFileMutationContext {
  course: Course;
  question: Question;
  user: User;
  authz_data: {
    authn_user: User;
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
 * A draft question file edit: the new contents (`null` deletes the file) and
 * the stale-edit guard for the contents the editor was opened with.
 */
export interface DraftQuestionFileEdit {
  /**
   * Path relative to the question root; callers validate it (e.g. via
   * `ModifiableQuestionFilePathSchema`) before calling.
   */
  path: string;
  /** Base64-encoded new contents, or `null` to delete the file. */
  encodedContents: string | null;
  /**
   * Hash of the contents the editor was opened with (from `readEditableTextFile`
   * or `getDraftQuestionFileContents`), or `null` if the file did not exist.
   */
  origHash: string | null;
}

/**
 * Saves edits to one or more draft question files in a single atomic
 * `QuestionModifyEditor` job: every file is written — or deleted — in one git
 * commit, and every file's `origHash` is checked under the course lock first,
 * so a stale tab (or a save racing the agent's writes) can't silently clobber
 * another writer's changes. A conflict on any file throws
 * `FileModifyConflictError` before anything is written; a file whose contents
 * still match its `origHash` is skipped entirely, so saving the question-code
 * editor's two files only ever touches the ones the user actually edited.
 *
 * Pass `force` to overwrite conflicting changes (recreating deleted files).
 */
export async function saveDraftQuestionFiles({
  course,
  question,
  user,
  authz_data,
  files,
  force,
}: DraftQuestionFileMutationContext & {
  files: DraftQuestionFileEdit[];
  force?: boolean;
}): Promise<void> {
  await runDraftEditorJob(
    new QuestionModifyEditor({
      locals: { course, user, authz_data, question },
      files: Object.fromEntries(files.map((file) => [file.path, file.encodedContents])),
      origHashes: Object.fromEntries(files.map((file) => [file.path, file.origHash])),
      force,
    }),
  );
}

/** Deletes a draft question file. `filePath` is relative to the question root. */
export async function deleteDraftQuestionFile({
  course,
  question,
  user,
  authz_data,
  filePath,
}: DraftQuestionFileMutationContext & {
  filePath: string;
}): Promise<void> {
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  await runDraftEditorJob(
    new FileDeleteEditor({
      locals: { course, user, authz_data },
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
      locals: { course, user, authz_data },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      oldPath,
      newPath,
    }),
  );
}

/**
 * Renames a draft question's QID and/or title via the course-files API and
 * returns the updated question. The QID is validated as a short name here so
 * the finalize and inline-rename flows reject malformed QIDs identically,
 * throwing an `HttpStatusError(400)` for an invalid QID. An omitted `title`
 * leaves the question's title unchanged.
 *
 * Throws {@link EditJobFailedError} if the rename's sync job fails, so callers
 * can translate it into a `SYNC_JOB_FAILED` app error (or let it surface as a
 * standard error page for the full-page finalize flow).
 */
export async function renameDraftQuestion({
  course,
  question,
  user,
  authz_data,
  qid,
  title,
}: DraftQuestionFileMutationContext & {
  qid: string;
  title: string | undefined;
}): Promise<Question> {
  const validation = validateShortName(qid);
  if (!validation.valid) {
    throw new HttpStatusError(400, `Invalid QID: ${validation.lowercaseMessage}`);
  }

  const result = await getCourseFilesClient().renameQuestion.mutate({
    course_id: course.id,
    user_id: user.id,
    authn_user_id: authz_data.authn_user.id,
    has_course_permission_edit: authz_data.has_course_permission_edit,
    question_id: question.id,
    qid,
    title,
  });

  if (result.status === 'error') {
    throw new EditJobFailedError(result.job_sequence_id);
  }

  // Re-fetch the question in case the QID was changed to avoid conflicts.
  return await selectQuestionById(question.id);
}

/** Uploads a draft question file. `filePath` is relative to the question root. */
export async function uploadDraftQuestionFile({
  course,
  question,
  user,
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
      locals: { course, user, authz_data },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      filePath: fullPath,
      fileContents,
    }),
  );
}
