import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import * as error from '@prairielearn/error';

import type {
  DraftQuestionFileBrowserBreadcrumbSegment,
  DraftQuestionFileBrowserData,
  DraftQuestionFileBrowserDirectory,
  DraftQuestionFileBrowserFile,
} from '../components/DraftQuestionFileBrowser.js';
import { browseDirectory, browseFile } from '../components/FileBrowser.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';

import { b64EncodeUnicode } from './base64-util.js';
import { config } from './config.js';
import { getCourseFilesClient } from './course-files-api.js';
import type { Course, Question, User } from './db-types.js';
import { readEditableTextFile } from './editableFile.js';
import { getPaths } from './instructorFiles.js';
import { encodePath } from './uri-util.js';

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

interface DraftQuestionFilesLocals {
  __csrf_token: string;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
  urlPrefix: string;
}
type QuestionPathType = 'file' | 'directory';

function encodeCourseFilePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function isDraftQuestionInfoFile(filePath: string) {
  return path.posix.normalize(filePath) === 'info.json';
}

export function assertCanModifyDraftQuestionFilePath({
  course,
  question,
  fullPath,
}: {
  course: Pick<Course, 'path'>;
  question: Pick<Question, 'draft' | 'qid'> | null | undefined;
  fullPath: string;
}) {
  if (!question?.draft || !question.qid) return;

  const questionPath = path.resolve(course.path, 'questions', question.qid);
  const resolvedFullPath = path.resolve(fullPath);
  if (!resolvedFullPath.startsWith(`${questionPath}${path.sep}`)) return;

  const questionRelativePath = path
    .relative(questionPath, resolvedFullPath)
    .split(path.sep)
    .join('/');
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
  const fileActionUrl = `${resLocals.urlPrefix}/question/${resLocals.question.id}/file_view/${encodeCourseFilePath(
    questionRootPath,
  )}`;

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
      coursePath: file.path,
      workingDirectory: file.dir,
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
    csrfToken: generateCsrfToken({
      url: fileActionUrl,
      authnUserId: resLocals.authn_user.id,
    }),
    fileActionUrl,
    editorUrl,
    workingPath: paths.workingPath,
    selectedDirectory,
    maxFileSizeBytes: config.fileUploadMaxBytes,
    breadcrumb,
    specialDirs: paths.specialDirs.map((d) => ({
      label: d.label,
      path: d.path,
      infoHtml: d.info.toString(),
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
  if (isDraftQuestionInfoFile(filePath)) {
    throw new error.HttpStatusError(400, DRAFT_INFO_JSON_DISABLED_REASON);
  }

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
