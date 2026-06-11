// This module reads the course's git repository directly from the local
// filesystem; it shares the co-location assumption documented in the
// architecture note in `./mutations.ts` (PrairieLearnInc/sysconf#1487).
import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import { config } from '../config.js';
import { getCourseFilesClient } from '../course-files-api.js';
import type { Course, Question, User } from '../db-types.js';
import { readEditableTextFile } from '../editorUtil.js';
import { browseDirectory, getBinaryFileKind, getFileDownloadUrl } from '../file-browser.js';
import { type InstructorFilePaths, getPaths } from '../instructorFiles.js';
import { encodePath } from '../uri-util.js';

import {
  getQuestionRootPath,
  isDraftQuestionInfoFile,
  requireQuestionQid,
  resolveWithinQuestionRoot,
} from './paths.js';
import { DRAFT_INFO_JSON_DISABLED_REASON } from './paths.shared.js';
import type { DraftEditorSelection } from './selection.js';
import { CODE_EDITOR_TAB_FILES } from './urls.js';

export interface DraftQuestionFileBrowserBreadcrumbSegment {
  name: string;
  /**
   * Path relative to the question root that this segment navigates to.
   * `null` means the segment is not a directory link — either the question
   * root or a leaf file.
   */
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

/** The file data the draft editor renders: code-file contents, browser listing, and selection. */
export interface QuestionFilesData {
  /** Base64-encoded file contents, keyed by question-relative path. */
  files: Record<string, string>;
  fileBrowser: DraftQuestionFileBrowserData;
  selectedFile: SelectedQuestionFile | null;
  selectedFilePreview: SelectedQuestionFilePreview | null;
  /**
   * Breadcrumb describing the currently displayed location. When a file is
   * shown, the file is the active leaf; otherwise the deepest visible
   * directory is active. Rendered by `FileBrowserBreadcrumb` in every view.
   */
  breadcrumb: DraftQuestionFileBrowserBreadcrumbSegment[];
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
    const encodedPath = encodePath(paths.workingPathRelativeToCourse);
    const fileDownloadUrl = `${paths.urlPrefix}/file_download/${encodedPath}`;
    const binaryFileKind = await getBinaryFileKind(fullPath);

    return {
      selectedFile: null,
      selectedFilePreview: {
        path: filePath,
        fileViewUrl: `${paths.urlPrefix}/file_view/${encodedPath}`,
        downloadUrl: getFileDownloadUrl({
          urlPrefix: paths.urlPrefix,
          path: paths.workingPathRelativeToCourse,
          name: path.basename(filePath),
        }),
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
 * Resolves the directory the file browser should list. A `null` value, a
 * missing directory, or a path that is not a directory all resolve to the
 * question root — a stale `?dir=` query parameter should not break the page,
 * mirroring how {@link readSelectedQuestionFile} treats a stale `?file=`.
 */
async function resolveSelectedDirectory({
  resLocals,
  selectedDirectory,
}: {
  resLocals: DraftQuestionFilesLocals;
  selectedDirectory: string | null;
}): Promise<string | null> {
  if (selectedDirectory == null) return null;

  const { course, question } = resLocals;
  const questionRootPath = getQuestionRootPath(course.path, requireQuestionQid(question));
  const fullPath = resolveWithinQuestionRoot(questionRootPath, selectedDirectory);

  let stat: Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return stat.isDirectory() ? selectedDirectory : null;
}

/**
 * Resolves a course-root-relative path (OS separators) to a path relative to
 * the question root (POSIX separators). Used to translate `paths.branch` /
 * directory listing paths into the form the editor URLs expect.
 */
function buildToQuestionRelativePath(questionRootPath: string) {
  return (courseRelativePath: string) =>
    path.posix.relative(questionRootPath, courseRelativePath.split(path.sep).join('/'));
}

/**
 * Builds breadcrumb segments for a directory by walking `paths.branch` and
 * keeping only directories the user can view. The deepest viewable directory
 * is the active segment unless `leafActive` is false (e.g. when a file leaf
 * will be appended).
 */
function buildDirectoryBreadcrumb({
  paths,
  questionRootPath,
  leafActive,
}: {
  paths: InstructorFilePaths;
  questionRootPath: string;
  leafActive: boolean;
}): DraftQuestionFileBrowserBreadcrumbSegment[] {
  const toQuestionRelativePath = buildToQuestionRelativePath(questionRootPath);
  const viewableBranch = paths.branch.filter((dir) => dir.canView);
  return viewableBranch.map((dir, index): DraftQuestionFileBrowserBreadcrumbSegment => {
    const relativePath = toQuestionRelativePath(dir.path);
    return {
      name: dir.name,
      directory: relativePath === '' ? null : relativePath,
      isActive: leafActive && index === viewableBranch.length - 1,
    };
  });
}

/**
 * Builds the breadcrumb the editor shows above whichever view is active. A
 * selected file is the active leaf (its parent dirs are linkable); otherwise
 * the deepest viewable directory is the active leaf.
 */
function buildBreadcrumb({
  resLocals,
  questionRootPath,
  selectedFilePath,
  selectedDirectory,
}: {
  resLocals: DraftQuestionFilesLocals;
  questionRootPath: string;
  selectedFilePath: string | null;
  selectedDirectory: string | null;
}): DraftQuestionFileBrowserBreadcrumbSegment[] {
  const fileParentDir =
    selectedFilePath != null
      ? (() => {
          const parent = path.posix.dirname(selectedFilePath);
          return parent === '.' ? null : parent;
        })()
      : selectedDirectory;
  const requestedPath =
    fileParentDir == null ? questionRootPath : path.posix.join(questionRootPath, fileParentDir);
  const paths = getPaths(requestedPath, { ...resLocals, navPage: 'question' });
  const dirSegments = buildDirectoryBreadcrumb({
    paths,
    questionRootPath,
    leafActive: selectedFilePath == null,
  });
  if (selectedFilePath == null) return dirSegments;
  return [
    ...dirSegments,
    { name: path.posix.basename(selectedFilePath), directory: null, isActive: true },
  ];
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
  const effectiveSelectedDirectory = await resolveSelectedDirectory({
    resLocals,
    selectedDirectory,
  });
  const requestedPath =
    effectiveSelectedDirectory == null
      ? questionRootPath
      : path.posix.join(questionRootPath, effectiveSelectedDirectory);
  const paths = getPaths(requestedPath, {
    ...resLocals,
    navPage: 'question',
  });
  const toQuestionRelativePath = buildToQuestionRelativePath(questionRootPath);

  const directoryListings = await browseDirectory({ paths });

  const files = directoryListings.files.map((file): DraftQuestionFileBrowserFile => {
    const selectedFilePath = toQuestionRelativePath(file.path);
    return {
      id: file.id,
      name: file.name,
      selectedFilePath,
      downloadUrl: getFileDownloadUrl({
        urlPrefix: paths.urlPrefix,
        path: file.path,
        name: file.name,
      }),
      canView: file.canView,
      canEdit: file.canEdit,
      canUpload: file.canUpload,
      canDownload: file.canDownload,
      canRename: file.canRename,
      canDelete: file.canDelete,
      syncErrors: file.syncErrors,
      syncWarnings: file.syncWarnings,
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

  return {
    hasEditPermission: paths.hasEditPermission,
    editorUrl,
    urlPrefix: paths.urlPrefix,
    selectedDirectory: effectiveSelectedDirectory,
    maxFileSizeBytes: config.fileUploadMaxBytes,
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
  selection,
}: {
  resLocals: DraftQuestionFilesLocals;
  editorUrl: string;
  selection: DraftEditorSelection;
}): Promise<QuestionFilesData> {
  // A file selection that's handled elsewhere (the `info.json` editor or the
  // dedicated Files tab for `question.html` / `server.py`) resolves to no
  // selected file; the browser falls back to the root.
  const filePathToRead =
    selection.kind === 'file' &&
    !isDraftQuestionInfoFile(selection.path) &&
    !CODE_EDITOR_TAB_FILES.has(selection.path)
      ? selection.path
      : null;
  const browserDirectory = selection.kind === 'dir' ? selection.path : null;

  const courseFilesClient = getCourseFilesClient();
  // `getQuestionFiles` already goes through the course-files API, while the
  // browser listing and the selected-file read still touch the filesystem
  // directly (see the co-location note in `./mutations.ts`). The two paths will
  // converge on the API once file storage is split off the main server.
  const [{ files }, fileBrowser, selectedQuestionFile] = await Promise.all([
    courseFilesClient.getQuestionFiles.query({
      course_id: resLocals.course.id,
      question_id: resLocals.question.id,
    }),
    buildDraftQuestionFileBrowserData({
      resLocals,
      editorUrl,
      selectedDirectory: browserDirectory,
    }),
    readSelectedQuestionFile({ resLocals, filePath: filePathToRead }),
  ]);

  // The breadcrumb tracks what the user actually sees. If a `?file=` param
  // failed to resolve to a viewable file, fall back to the directory chain so
  // the breadcrumb matches the file-browser view that ends up rendered.
  const resolvedFilePath =
    selectedQuestionFile.selectedFile?.path ??
    selectedQuestionFile.selectedFilePreview?.path ??
    null;
  const breadcrumb = buildBreadcrumb({
    resLocals,
    questionRootPath: `questions/${requireQuestionQid(resLocals.question)}`,
    selectedFilePath: resolvedFilePath,
    selectedDirectory: fileBrowser.selectedDirectory,
  });

  return { files, fileBrowser, ...selectedQuestionFile, breadcrumb };
}
