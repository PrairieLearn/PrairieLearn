import {
  type FileDiffMetadata,
  type SupportedLanguages,
  getFiletypeFromFileName,
  getSingularPatch,
  preloadHighlighter,
} from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

// Pierre's blue/orange palette, which stays distinguishable with red-green color blindness.
const THEME = {
  light: 'pierre-light-protanopia-deuteranopia',
  dark: 'pierre-dark-protanopia-deuteranopia',
} as const;

// The themes' added/deleted colors, for line counts and icons outside Pierre's shadow root.
const LINE_COLORS = {
  light: { added: '#216cab', deleted: '#ac6023' },
  dark: { added: '#97c4ff', deleted: '#fe8c2c' },
} as const;

const ADDED_COLOR = 'var(--review-diff-added)';
const DELETED_COLOR = 'var(--review-diff-deleted)';

export const CHANGES = {
  added: { icon: 'bi-file-earmark-plus', color: ADDED_COLOR, label: 'Added', type: 'new' },
  modified: {
    icon: 'bi-file-earmark-diff',
    color: 'var(--bs-warning)',
    label: 'Modified',
    type: 'change',
  },
  deleted: {
    icon: 'bi-file-earmark-minus',
    color: DELETED_COLOR,
    label: 'Deleted',
    type: 'deleted',
  },
} as const;

// Pierre puts +/− flush against the line numbers; leave room on both sides, as GitHub does.
const INDICATOR_CSS = `
[data-indicators='classic'] :is([data-line], [data-no-newline]) { padding-inline-start: 3ch; }
[data-indicators='classic'] :is([data-line], [data-no-newline])::before { left: 1ch; }
`;

/** What the viewer needs to know about a changed file. */
interface DiffFile {
  path: string;
  change: 'added' | 'modified' | 'deleted';
  /** A unified diff, or `null` for binary files. */
  patch: string | null;
}

interface ParsedFile<File extends DiffFile = DiffFile> {
  file: File;
  diff: FileDiffMetadata | null;
  additions: number;
  deletions: number;
}

export function parseFile<File extends DiffFile>(file: File): ParsedFile<File> {
  if (file.patch === null) return { file, diff: null, additions: 0, deletions: 0 };
  // jsdiff patches lack Git's new/deleted file mode lines, so Pierre would treat every file as changed.
  const diff = { ...getSingularPatch(file.patch), type: CHANGES[file.change].type };
  return {
    file,
    diff,
    additions: diff.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
    deletions: diff.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
  };
}

const highlighterLoads = new Map<string, Promise<void>>();

const NOTHING_TO_HIGHLIGHT = Promise.resolve();

/**
 * Pierre renders no lines until its highlighter has loaded, so every file would mount as an empty
 * bordered box. The virtualizer would then treat all of them as visible and highlight every file
 * at once. Suspending until the highlighter is ready keeps the loading spinner up instead, and
 * lets the virtualizer measure real heights.
 */
export function loadHighlighter(parsed: ParsedFile[]) {
  const langs = new Set<SupportedLanguages>();
  for (const { diff } of parsed) {
    if (!diff || diff.hunks.length === 0) continue;
    langs.add(getFiletypeFromFileName(diff.prevName ?? diff.name));
    langs.add(getFiletypeFromFileName(diff.name));
  }
  // Binary and empty files only show a notice.
  if (langs.size === 0) return NOTHING_TO_HIGHLIGHT;
  const key = [...langs].sort().join(',');
  let load = highlighterLoads.get(key);
  if (!load) {
    // If preloading fails, render anyway and let Pierre retry and report the error.
    load = preloadHighlighter({ themes: [THEME.light, THEME.dark], langs: [...langs] }).catch(
      () => undefined,
    );
    highlighterLoads.set(key, load);
  }
  return load;
}

export function LineCounts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-monospace small text-nowrap">
      <span style={{ color: DELETED_COLOR }}>−{deletions}</span>{' '}
      <span style={{ color: ADDED_COLOR }}>+{additions}</span>
    </span>
  );
}

export function ChangeIcon({ change }: { change: DiffFile['change'] }) {
  const { icon, color, label } = CHANGES[change];
  return (
    <>
      <i className={clsx('bi', icon)} style={{ color }} aria-hidden="true" />
      <span className="visually-hidden">{label}:</span>
    </>
  );
}

/** Pierre renders inside a shadow root, so it can't see Bootstrap's color mode. */
export function bootstrapThemeType() {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
}

/** Sets the colors and fonts the diff and its line counts use. Put it on an element around them. */
export function diffStyle(themeType: 'light' | 'dark') {
  return {
    '--review-diff-added': LINE_COLORS[themeType].added,
    '--review-diff-deleted': LINE_COLORS[themeType].deleted,
    '--diffs-font-family': 'var(--bs-font-monospace)',
    '--diffs-header-font-family': 'var(--bs-body-font-family)',
  } as CSSProperties;
}

/** One file's changes, or a notice when there are no lines to show. */
export function FileChanges({
  file,
  diff,
  themeType,
  split = false,
  binaryNotice = "Binary file can't be previewed.",
  showFileName = true,
  showLineNumbers = true,
}: {
  file: DiffFile;
  /** The parsed patch, or `null` for a binary file. */
  diff: FileDiffMetadata | null;
  themeType: 'light' | 'dark';
  /** Show the old and new file side by side. */
  split?: boolean;
  binaryNotice?: string;
  showFileName?: boolean;
  showLineNumbers?: boolean;
}) {
  if (!diff) return <FileNotice file={file} message={binaryNotice} />;
  if (diff.hunks.length === 0) {
    return (
      <FileNotice
        file={file}
        message={file.change === 'modified' ? 'No content changes.' : 'Empty file.'}
      />
    );
  }
  return (
    <FileDiff
      fileDiff={diff}
      options={{
        // One side of an added or deleted file is empty, so split adds nothing.
        diffStyle: split && file.change === 'modified' ? 'split' : 'unified',
        theme: THEME,
        themeType,
        overflow: 'wrap',
        lineDiffType: 'word',
        // Mark changed lines with +/−, not just color.
        diffIndicators: 'classic',
        unsafeCSS: INDICATOR_CSS,
        disableFileHeader: !showFileName,
        disableLineNumbers: !showLineNumbers,
      }}
    />
  );
}

function FileNotice({ file, message }: { file: DiffFile; message: string }) {
  return (
    <>
      <div className="d-flex align-items-center gap-2 px-3 py-2 bg-body-tertiary border-bottom">
        <ChangeIcon change={file.change} />
        <span className="small text-break">{file.path}</span>
      </div>
      <p className="text-muted small px-3 py-3 mb-0">{message}</p>
    </>
  );
}
