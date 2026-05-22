import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import { config } from '../config.js';
import { getCourseFilesClient } from '../course-files-api.js';
import type { Course, Question, User } from '../db-types.js';
import { readEditableTextFile } from '../editableFile.js';
import { browseDirectory, getBinaryFileKind } from '../file-browser.js';
import { getPaths } from '../instructorFiles.js';
import { encodePath } from '../uri-util.js';

import {
  DRAFT_INFO_JSON_DISABLED_REASON,
  getQuestionRootPath,
  isDraftQuestionInfoFile,
  requireQuestionQid,
  resolveWithinQuestionRoot,
} from './paths.js';

interface DraftQuestionFileBrowserBreadcrumbSegment {
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

interface DraftQuestionFileBrowserSpecialDir {
  label: string;
  /** Directory uploaded files are placed in, relative to the question root. */
  directory: string;
}

export interface DraftQuestionFileBrowserData {
  hasEditPermission: boolean;
  /** Base editor URL used to build file and directory links. */
  editorUrl: string;
  /** Course URL prefix, used to build links such as job-log pages. */
  urlPrefix: string;
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
  /** Hash of the contents as opened, used as the save's stale-edit (TOCTOU) guard. */
  contentHash: string;
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

/**
 * The `res.locals` slice the draft file panel needs. Also serves as the
 * `aiDraftFiles` tRPC context's `locals` contract, so it carries the `user` /
 * `authn_user` the file mutation procedures forward to
 * {@link DraftQuestionFileMutationContext}.
 */
export interface DraftQuestionFilesLocals {
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
  urlPrefix: string;
  user: User;
}

function encodeCourseFilePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

/**
 * Reads the file selected in the editor. A `null` path, a missing file, or a
 * path that is not a file all resolve to "no selection" — a stale `?file=`
 * query parameter should not break the page.
 */
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
  const qid = requireQuestionQid(question);
  const questionRootPath = getQuestionRootPath(course.path, qid);
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  let stat: Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { selectedFile: null, selectedFilePreview: null };
    }
    throw err;
  }
  if (!stat.isFile()) {
    return { selectedFile: null, selectedFilePreview: null };
  }
  if (await isBinaryFile(fullPath)) {
    const paths = getPaths(path.posix.join('questions', qid, filePath), {
      ...resLocals,
      navPage: 'question',
    });
    const encodedPath = encodeCourseFilePath(paths.workingPathRelativeToCourse);
    const fileDownloadUrl = `${paths.urlPrefix}/file_download/${encodedPath}`;
    const binaryFileKind = await getBinaryFileKind(fullPath);

    return {
      selectedFile: null,
      selectedFilePreview: {
        path: filePath,
        fileViewUrl: `${paths.urlPrefix}/file_view/${encodedPath}`,
        downloadUrl: `${fileDownloadUrl}?attachment=${encodeURIComponent(path.basename(filePath))}`,
        content:
          binaryFileKind === 'image'
            ? { kind: 'image', src: fileDownloadUrl }
            : binaryFileKind === 'pdf'
              ? { kind: 'pdf', src: `${fileDownloadUrl}?type=application/pdf#view=FitH` }
              : { kind: 'none' },
      },
    };
  }

  const editableFile = await readEditableTextFile({
    courseId: course.id,
    coursePath: course.path,
    fullPath,
    courseRelativePath: path.posix.join('questions', qid, filePath),
  });

  return {
    selectedFile: {
      path: filePath,
      encodedContents: editableFile.contents,
      contentHash: editableFile.contentHash,
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
}): Promise<DraftQuestionFileBrowserData> {
  const qid = requireQuestionQid(resLocals.question);
  const questionRootPath = `questions/${qid}`;
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
    hasEditPermission: paths.hasEditPermission,
    editorUrl,
    urlPrefix: paths.urlPrefix,
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

/**
 * Assembles everything the draft editor needs to render its file panel: the
 * `question.html`/`server.py` contents, the file browser listing, and the
 * currently selected file (as editable text or a binary preview).
 */
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
