// This module reads the course's git repository directly from the local
// filesystem; it shares the co-location assumption documented in the
// architecture note in `./mutations.ts` (PrairieLearnInc/sysconf#1487).
import type { Stats } from 'node:fs';
import * as path from 'node:path';

import fs from 'fs-extra';
import { isBinaryFile } from 'isbinaryfile';

import { b64DecodeUnicode, b64EncodeUnicode } from '../base64-util.js';
import { config } from '../config.js';
import { getCourseFilesClient } from '../course-files-api.js';
import type { Course, Question } from '../db-types.js';
import { readEditableTextFile } from '../editorUtil.js';
import { getHash } from '../editors.js';
import { browseDirectory, getBinaryFileKind } from '../file-browser.js';

import {
  getQuestionRootPath,
  isDraftQuestionInfoFile,
  requireQuestionQid,
  resolveWithinQuestionRoot,
} from './paths.js';
import { DRAFT_INFO_JSON_DISABLED_REASON } from './paths.shared.js';
import type { DraftEditorSelection } from './selection.js';
import { CODE_EDITOR_TAB_FILES } from './urls.js';

export interface DraftQuestionFileBrowserFile {
  id: string | number;
  name: string;
  /** Path relative to the question root, identifying the file in the editor. */
  selectedFilePath: string;
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
  selectedDirectory: string;
  canView: boolean;
}

interface DraftQuestionFileBrowserSpecialDir {
  label: string;
  /** Directory uploaded files are placed in, relative to the question root. */
  directory: string;
}

export interface DraftQuestionFileBrowserData {
  hasEditPermission: boolean;
  /**
   * The question's QID as of this listing, used by the client to build
   * file download/view URLs (which are course-relative, i.e. include
   * `questions/<qid>/`). Fetched atomically with the listing so the two
   * cannot drift after a rename.
   */
  qid: string;
  /** Path of the directory being browsed, relative to the question root. */
  selectedDirectory: string | null;
  /** Maximum upload size in bytes. */
  maxFileSizeBytes: number;
  specialDirs: DraftQuestionFileBrowserSpecialDir[];
  files: DraftQuestionFileBrowserFile[];
  dirs: DraftQuestionFileBrowserDirectory[];
}

/**
 * The file selected in the editor: either editable text (opened in the Ace
 * editor) or a binary file (shown as a preview). All paths are relative to the
 * question root; the client builds the preview/download URLs.
 */
export type DraftQuestionSelectedFile =
  | {
      kind: 'editor';
      path: string;
      encodedContents: string;
      /** Hash of the contents as opened, used as the save's stale-edit (TOCTOU) guard. */
      contentHash: string;
      aceMode: string;
      lintHtmlMustache: boolean;
    }
  | {
      kind: 'preview';
      path: string;
      /** How to render the preview; binary files are an image, a PDF, or unpreviewable. */
      preview: 'image' | 'pdf' | 'other';
    };

/** The data backing the draft editor's "All files" browser view. */
export interface DraftQuestionBrowseData {
  fileBrowser: DraftQuestionFileBrowserData;
  selected: DraftQuestionSelectedFile | null;
}

/** A question file's contents and its save-time stale-edit guard. */
export interface DraftQuestionFileContent {
  /** Base64-encoded file contents. */
  encodedContents: string;
  /** Hash of the contents as fetched, passed back as a save's `origHash`. */
  hash: string;
}

/** File contents keyed by question-relative path. */
export interface DraftQuestionFileContents {
  files: Partial<Record<string, DraftQuestionFileContent>>;
}

/** The `res.locals` slice the draft file panel needs. */
export interface DraftQuestionFilesLocals {
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
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
}): Promise<DraftQuestionSelectedFile | null> {
  if (filePath == null) return null;

  const { course, question } = resLocals;
  const qid = requireQuestionQid(question);
  const questionRootPath = getQuestionRootPath(course.path, qid);
  const fullPath = resolveWithinQuestionRoot(questionRootPath, filePath);

  let stat: Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  if (!stat.isFile()) return null;

  if (await isBinaryFile(fullPath)) {
    return {
      kind: 'preview',
      path: filePath,
      preview: await getBinaryFileKind(fullPath),
    };
  }

  const editableFile = await readEditableTextFile({
    courseId: course.id,
    coursePath: course.path,
    fullPath,
    courseRelativePath: path.posix.join('questions', qid, filePath),
  });

  return {
    kind: 'editor',
    path: filePath,
    encodedContents: editableFile.contents,
    contentHash: editableFile.contentHash,
    aceMode: editableFile.aceMode,
    lintHtmlMustache: editableFile.lintHtmlMustache,
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
 * Builds the serializable data describing the draft question's file browser.
 * This is the data layer for the `DraftQuestionFileBrowser` component: it reads
 * the filesystem and resolves paths so the component only renders.
 */
async function buildDraftQuestionFileBrowserData({
  resLocals,
  selectedDirectory,
}: {
  resLocals: DraftQuestionFilesLocals;
  selectedDirectory: string | null;
}): Promise<DraftQuestionFileBrowserData> {
  const { course, question, authz_data } = resLocals;
  const qid = requireQuestionQid(question);
  const questionRootPath = getQuestionRootPath(course.path, qid);
  const effectiveSelectedDirectory = await resolveSelectedDirectory({
    resLocals,
    selectedDirectory,
  });
  const hasEditPermission = authz_data.has_course_permission_edit && !course.example_course;

  const directoryListings = await browseDirectory({
    paths: {
      coursePath: course.path,
      courseId: course.id,
      workingPath:
        effectiveSelectedDirectory == null
          ? questionRootPath
          : resolveWithinQuestionRoot(questionRootPath, effectiveSelectedDirectory),
      hasEditPermission,
      cannotMove: [path.join(questionRootPath, 'info.json')],
      invalidRootPaths: [],
    },
  });

  // Listing entries are direct children of the browsed directory, so their
  // question-relative path is just their name joined onto it.
  const toQuestionRelativePath = (name: string) =>
    effectiveSelectedDirectory == null ? name : path.posix.join(effectiveSelectedDirectory, name);

  const files = directoryListings.files.map(
    ({ isFile: _isFile, path: _path, dir: _dir, ...file }): DraftQuestionFileBrowserFile => {
      const selectedFilePath = toQuestionRelativePath(file.name);
      return {
        ...file,
        selectedFilePath,
        disabledReason: isDraftQuestionInfoFile(selectedFilePath)
          ? DRAFT_INFO_JSON_DISABLED_REASON
          : null,
      };
    },
  );

  const dirs = directoryListings.dirs.map(
    (dir): DraftQuestionFileBrowserDirectory => ({
      name: dir.name,
      selectedDirectory: toQuestionRelativePath(dir.name),
      canView: dir.canView,
    }),
  );

  return {
    hasEditPermission,
    qid,
    selectedDirectory: effectiveSelectedDirectory,
    maxFileSizeBytes: config.fileUploadMaxBytes,
    // Upload destinations offered at the question root, matching the special
    // directories the instructor file browser shows for a question.
    specialDirs:
      effectiveSelectedDirectory == null
        ? [
            { label: 'Client', directory: 'clientFilesQuestion' },
            { label: 'Test', directory: 'tests' },
          ]
        : [],
    files,
    dirs,
  };
}

/**
 * Reads the contents of every file in the draft question, for the question-code
 * editors. Goes through the course-files API, while the browse data below still
 * touches the filesystem directly (see the co-location note in `./mutations.ts`).
 * The two paths will converge on the API once file storage is split off the
 * main server.
 */
export async function getDraftQuestionFileContents({
  courseId,
  questionId,
}: {
  courseId: string;
  questionId: string;
}): Promise<DraftQuestionFileContents> {
  const { files } = await getCourseFilesClient().getQuestionFiles.query({
    course_id: courseId,
    question_id: questionId,
  });
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([filePath, encodedContents]) => [
        filePath,
        {
          encodedContents,
          // `QuestionModifyEditor` checks `origHash` against a UTF-8 round-trip
          // of the on-disk contents, so the hash is computed through the same
          // round-trip rather than over the raw-byte base64 returned by
          // `getQuestionFiles`.
          hash: getHash(b64EncodeUnicode(b64DecodeUnicode(encodedContents))),
        },
      ]),
    ),
  };
}

/**
 * Assembles the draft editor's file-browser view for `selection`: the directory
 * listing and the currently selected file (as editable text or a binary
 * preview).
 */
export async function browseDraftQuestionFiles({
  resLocals,
  selection,
}: {
  resLocals: DraftQuestionFilesLocals;
  selection: DraftEditorSelection;
}): Promise<DraftQuestionBrowseData> {
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

  const [fileBrowser, selected] = await Promise.all([
    buildDraftQuestionFileBrowserData({
      resLocals,
      selectedDirectory: browserDirectory,
    }),
    readSelectedQuestionFile({ resLocals, filePath: filePathToRead }),
  ]);

  return { fileBrowser, selected };
}
