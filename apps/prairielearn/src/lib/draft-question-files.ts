import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';

import { b64EncodeUnicode } from './base64-util.js';
import { config } from './config.js';
import { getCourseFilesClient } from './course-files-api.js';
import type { Course, Question, User } from './db-types.js';
import { readEditableTextFile } from './editableFile.js';
import { type Editor, FileDeleteEditor, FileRenameEditor, FileUploadEditor } from './editors.js';
import { browseDirectory, browseFile } from './file-browser.js';
import { getPaths } from './instructorFiles.js';
import { encodePath } from './uri-util.js';

export interface DraftQuestionFileBrowserBreadcrumbSegment {
  name: string;
  /** Path relative to the question root; `null` for the question root. */
  directory: string | null;
  isActive: boolean;
}

export interface DraftQuestionFileBrowserFile {
  id: string | number;
  name: string;
  /** Path relative to the question root, identifying the file in the editor. */
  selectedFilePath: string;
  downloadUrl: string;
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
  /** When set, the file is managed elsewhere (e.g. `info.json`) and cannot be edited. */
  disabledReason: string | null;
}

export interface DraftQuestionFileBrowserDirectory {
  name: string;
  /** Path relative to the question root. */
  selectedDirectory: string | null;
  canView: boolean;
}

export interface DraftQuestionFileBrowserSpecialDir {
  label: string;
  /** Directory uploaded files are placed in, relative to the question root. */
  directory: string;
}

export interface DraftQuestionFileBrowserData {
  isReadOnly: boolean;
  hasEditPermission: boolean;
  /** Base editor URL used to build file and directory links. */
  editorUrl: string;
  /** Path of the directory being browsed, relative to the question root. */
  selectedDirectory: string | null;
  /** Maximum upload size in bytes. */
  maxFileSizeBytes: number;
  breadcrumb: DraftQuestionFileBrowserBreadcrumbSegment[];
  specialDirs: DraftQuestionFileBrowserSpecialDir[];
  files: DraftQuestionFileBrowserFile[];
  dirs: DraftQuestionFileBrowserDirectory[];
}

export interface SelectedQuestionFile {
  path: string;
  encodedContents: string;
  aceMode: string;
  lintHtmlMustache: boolean;
}

export interface SelectedQuestionFilePreview {
  path: string;
  fileViewUrl: string;
  downloadUrl: string;
  /**
   * How to render the preview. Only binary files reach this path, so the
   * content is an image, a PDF, or unpreviewable.
   */
  content: { kind: 'image'; src: string } | { kind: 'pdf'; src: string } | { kind: 'none' };
}

const DRAFT_INFO_JSON_DISABLED_REASON =
  'Draft question metadata is managed by the draft editor. Only finalized questions can edit info.json directly.';

export interface DraftQuestionFilesLocals {
  __csrf_token: string;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
  urlPrefix: string;
  user: User;
}
type QuestionPathType = 'file' | 'directory';

function encodeCourseFilePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function isDraftQuestionInfoFile(filePath: string) {
  return path.posix.normalize(filePath) === 'info.json';
}

/**
 * Draft question metadata (`info.json`) is managed by the draft editor and
 * cannot be edited through the generic file operations. Throws if the given
 * question-relative path targets it.
 */
export function assertCanModifyDraftQuestionFile(questionRelativePath: string) {
  if (isDraftQuestionInfoFile(questionRelativePath)) {
    throw new error.HttpStatusError(400, DRAFT_INFO_JSON_DISABLED_REASON);
  }
}

export function getSelectedQuestionFilePath(queryValue: unknown): string | null {
  if (queryValue == null) return null;
  if (Array.isArray(queryValue)) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }
  if (typeof queryValue !== 'string') {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }
  return getQuestionRelativePath(queryValue, 'file');
}

export function getSelectedQuestionDirectory(queryValue: unknown): string | null {
  if (queryValue == null) return null;
  if (Array.isArray(queryValue)) {
    throw new error.HttpStatusError(400, 'Invalid selected directory');
  }
  if (typeof queryValue !== 'string') {
    throw new error.HttpStatusError(400, 'Invalid selected directory');
  }

  const trimmedPath = queryValue.trim();
  if (trimmedPath === '' || trimmedPath === '.') return null;

  return getQuestionRelativePath(trimmedPath, 'directory');
}

function getQuestionRelativePath(filePath: string, pathType: QuestionPathType): string {
  const trimmedPath = filePath.trim();
  if (trimmedPath === '' || trimmedPath.includes('\0') || trimmedPath.includes('\\')) {
    throw new error.HttpStatusError(400, `Invalid selected ${pathType} path`);
  }

  const normalizedPath = path.posix.normalize(trimmedPath);
  if (
    normalizedPath === '.' ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    throw new error.HttpStatusError(400, `Invalid selected ${pathType} path`);
  }

  return normalizedPath;
}

export function normalizeQuestionFilePath(filePath: string): string {
  return getQuestionRelativePath(filePath, 'file');
}

async function readSelectedQuestionFile({
  resLocals,
  filePath,
}: {
  resLocals: DraftQuestionFilesLocals;
  filePath: string | null;
}): Promise<{
  selectedFile: SelectedQuestionFile | null;
  selectedFilePreview: SelectedQuestionFilePreview | null;
}> {
  if (filePath == null) return { selectedFile: null, selectedFilePreview: null };

  const { course, question } = resLocals;
  if (!question.qid) {
    throw new error.HttpStatusError(400, 'Question does not have a QID');
  }

  const questionPath = path.resolve(course.path, 'questions', question.qid);
  const fullPath = path.resolve(questionPath, filePath);
  if (!fullPath.startsWith(`${questionPath}${path.sep}`)) {
    throw new error.HttpStatusError(400, 'Invalid selected file path');
  }

  let stat: Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new error.HttpStatusError(404, 'Selected file not found');
    }
    throw err;
  }
  if (!stat.isFile()) {
    throw new error.HttpStatusError(400, 'Selected path is not a file');
  }
  if (await isBinaryFile(fullPath)) {
    const paths = getPaths(path.posix.join('questions', question.qid, filePath), {
      ...resLocals,
      navPage: 'question',
    });
    const encodedPath = encodeCourseFilePath(paths.workingPathRelativeToCourse);
    const fileDownloadUrl = `${paths.urlPrefix}/file_download/${encodedPath}`;
    const fileInfo = await browseFile({ paths });

    return {
      selectedFile: null,
      selectedFilePreview: {
        path: filePath,
        fileViewUrl: `${paths.urlPrefix}/file_view/${encodedPath}`,
        downloadUrl: `${fileDownloadUrl}?attachment=${encodeURIComponent(path.basename(filePath))}`,
        content: fileInfo.isImage
          ? { kind: 'image', src: fileDownloadUrl }
          : fileInfo.isPDF
            ? { kind: 'pdf', src: `${fileDownloadUrl}?type=application/pdf#view=FitH` }
            : { kind: 'none' },
      },
    };
  }

  const editableFile = await readEditableTextFile({
    courseId: course.id,
    coursePath: course.path,
    fullPath,
    courseRelativePath: path.posix.join('questions', question.qid, filePath),
  });

  return {
    selectedFile: {
      path: filePath,
      encodedContents: editableFile.contents,
      aceMode: editableFile.aceMode,
      lintHtmlMustache: editableFile.lintHtmlMustache,
    },
    selectedFilePreview: null,
  };
}

/**
 * Builds the serializable data describing the draft question's file browser.
 * This is the data layer for the `DraftQuestionFileBrowser` component: it reads
 * the filesystem and resolves paths/URLs so the component only renders.
 */
async function buildDraftQuestionFileBrowserData({
  resLocals,
  editorUrl,
  selectedDirectory,
}: {
  resLocals: DraftQuestionFilesLocals;
  editorUrl: string;
  selectedDirectory: string | null;
}): Promise<DraftQuestionFileBrowserData | null> {
  if (!resLocals.question.qid) return null;

  const questionRootPath = `questions/${resLocals.question.qid}`;
  const requestedPath =
    selectedDirectory == null
      ? questionRootPath
      : path.posix.join(questionRootPath, selectedDirectory);
  const paths = getPaths(requestedPath, {
    ...resLocals,
    navPage: 'question',
  });

  /**
   * Resolves a course-root-relative path (with OS separators) to a path
   * relative to the question root (with POSIX separators).
   */
  function toQuestionRelativePath(courseRelativePath: string) {
    return path.posix.relative(questionRootPath, courseRelativePath.split(path.sep).join('/'));
  }

  const directoryListings = await browseDirectory({ paths });

  const files = directoryListings.files.map((file): DraftQuestionFileBrowserFile => {
    const selectedFilePath = toQuestionRelativePath(file.path);
    return {
      id: file.id,
      name: file.name,
      selectedFilePath,
      downloadUrl: `${paths.urlPrefix}/file_download/${encodePath(file.path)}?attachment=${encodeURIComponent(
        file.name,
      )}`,
      canView: file.canView,
      canEdit: file.canEdit,
      canUpload: file.canUpload,
      canDownload: file.canDownload,
      canRename: file.canRename,
      canDelete: file.canDelete,
      syncErrors: file.sync_errors,
      syncWarnings: file.sync_warnings,
      disabledReason: isDraftQuestionInfoFile(selectedFilePath)
        ? DRAFT_INFO_JSON_DISABLED_REASON
        : null,
    };
  });

  const dirs = directoryListings.dirs.map((dir): DraftQuestionFileBrowserDirectory => {
    const relativePath = toQuestionRelativePath(dir.path);
    return {
      name: dir.name,
      selectedDirectory: relativePath === '' ? null : relativePath,
      canView: dir.canView,
    };
  });

  const viewableBranch = paths.branch.filter((dir) => dir.canView);
  const breadcrumb = viewableBranch.map((dir, index): DraftQuestionFileBrowserBreadcrumbSegment => {
    const relativePath = toQuestionRelativePath(dir.path);
    return {
      name: dir.name,
      directory: relativePath === '' ? null : relativePath,
      isActive: index === viewableBranch.length - 1,
    };
  });

  return {
    isReadOnly: false,
    hasEditPermission: paths.hasEditPermission,
    editorUrl,
    selectedDirectory,
    maxFileSizeBytes: config.fileUploadMaxBytes,
    breadcrumb,
    specialDirs: paths.specialDirs.map((d) => ({
      label: d.label,
      directory: toQuestionRelativePath(path.relative(resLocals.course.path, d.path)),
    })),
    files,
    dirs,
  };
}

export async function getQuestionFilesData({
  resLocals,
  editorUrl,
  selectedFilePath,
  selectedDirectory,
}: {
  resLocals: DraftQuestionFilesLocals;
  editorUrl: string;
  selectedFilePath: string | null;
  selectedDirectory: string | null;
}) {
  const courseFilesClient = getCourseFilesClient();
  const [{ files }, fileBrowser, selectedQuestionFile] = await Promise.all([
    courseFilesClient.getQuestionFiles.query({
      course_id: resLocals.course.id,
      question_id: resLocals.question.id,
    }),
    buildDraftQuestionFileBrowserData({ resLocals, editorUrl, selectedDirectory }),
    readSelectedQuestionFile({
      resLocals,
      filePath:
        selectedFilePath == null || isDraftQuestionInfoFile(selectedFilePath)
          ? null
          : selectedFilePath,
    }),
  ]);

  return { files, fileBrowser, ...selectedQuestionFile };
}

export async function saveDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  filePath,
  contents,
}: {
  course: Course;
  question: Question;
  user: User;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  urlPrefix: string;
  filePath: string;
  contents: string;
}) {
  assertCanModifyDraftQuestionFile(filePath);

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
    return {
      status: 'error' as const,
      editErrorUrl: urlPrefix + '/edit_error/' + result.job_sequence_id,
    };
  }

  return { status: 'ok' as const };
}

export type DraftQuestionFileEditResult =
  | { status: 'ok' }
  | { status: 'error'; editErrorUrl: string };

interface DraftQuestionFileEditorLocals {
  course: Course;
  question: Question;
  user: User;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  urlPrefix: string;
}

function getQuestionRootPath(
  course: Pick<Course, 'path'>,
  question: Pick<Question, 'qid'>,
): string {
  if (!question.qid) {
    throw new error.HttpStatusError(400, 'Question does not have a QID');
  }
  return path.resolve(course.path, 'questions', question.qid);
}

/**
 * Runs a file `Editor` for a draft question and translates a failed server job
 * into an `edit_error` URL, mirroring the result shape of `saveDraftQuestionFile`.
 */
async function runDraftQuestionFileEditor(
  editor: Editor,
  urlPrefix: string,
): Promise<DraftQuestionFileEditResult> {
  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    return {
      status: 'error',
      editErrorUrl: `${urlPrefix}/edit_error/${serverJob.jobSequenceId}`,
    };
  }
  return { status: 'ok' };
}

export async function deleteDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  filePath,
}: DraftQuestionFileEditorLocals & {
  /** Path of the file to delete, relative to the question root. */
  filePath: string;
}): Promise<DraftQuestionFileEditResult> {
  const questionRootPath = getQuestionRootPath(course, question);
  const relativePath = normalizeQuestionFilePath(filePath);
  assertCanModifyDraftQuestionFile(relativePath);
  const fullPath = path.resolve(questionRootPath, relativePath);

  return await runDraftQuestionFileEditor(
    new FileDeleteEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      deletePath: fullPath,
    }),
    urlPrefix,
  );
}

export async function renameDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  oldFilePath,
  newFilePath,
}: DraftQuestionFileEditorLocals & {
  /** Current path of the file, relative to the question root. */
  oldFilePath: string;
  /** Requested path of the file, relative to the question root. */
  newFilePath: string;
}): Promise<DraftQuestionFileEditResult> {
  const questionRootPath = getQuestionRootPath(course, question);
  const oldRelativePath = normalizeQuestionFilePath(oldFilePath);
  const newRelativePath = normalizeQuestionFilePath(newFilePath);
  assertCanModifyDraftQuestionFile(oldRelativePath);
  assertCanModifyDraftQuestionFile(newRelativePath);
  const oldPath = path.resolve(questionRootPath, oldRelativePath);
  const newPath = path.resolve(questionRootPath, newRelativePath);

  if (oldPath === newPath) return { status: 'ok' };

  return await runDraftQuestionFileEditor(
    new FileRenameEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      oldPath,
      newPath,
    }),
    urlPrefix,
  );
}

export async function uploadDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  filePath,
  fileContents,
}: DraftQuestionFileEditorLocals & {
  /** Path to write the uploaded file to, relative to the question root. */
  filePath: string;
  fileContents: Buffer;
}): Promise<DraftQuestionFileEditResult> {
  const questionRootPath = getQuestionRootPath(course, question);
  const relativePath = normalizeQuestionFilePath(filePath);
  assertCanModifyDraftQuestionFile(relativePath);
  const fullPath = path.resolve(questionRootPath, relativePath);

  return await runDraftQuestionFileEditor(
    new FileUploadEditor({
      locals: { authz_data: { ...authz_data, authn_user }, course, user },
      container: { rootPath: questionRootPath, invalidRootPaths: [] },
      filePath: fullPath,
      fileContents,
    }),
    urlPrefix,
  );
}
