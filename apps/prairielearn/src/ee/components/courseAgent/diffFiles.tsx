import {
  EXTENSION_TO_FILE_FORMAT,
  type FileDiffMetadata,
  type SupportedLanguages,
  getFiletypeFromFileName,
  getSingularPatch,
  preloadHighlighter,
} from '@pierre/diffs';
import { File, FileDiff } from '@pierre/diffs/react';
import clsx from 'clsx';
import { type CSSProperties, use, useEffect, useReducer } from 'react';

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
export interface DiffFile {
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
    for (const lang of diffLanguages(diff)) langs.add(lang);
  }
  return loadLanguages(langs);
}

/** The languages a diff's old and new file names call for. */
export function diffLanguages(diff: FileDiffMetadata) {
  return [getFiletypeFromFileName(diff.prevName ?? diff.name), getFiletypeFromFileName(diff.name)];
}

function loadLanguages(langs: Set<SupportedLanguages>) {
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

let baseHighlighter: Promise<boolean> | undefined;

/** Loads the highlighter itself, which every language needs, and tells whether it loaded. */
function loadBaseHighlighter() {
  baseHighlighter ??= preloadHighlighter({
    themes: [THEME.light, THEME.dark],
    langs: ['text'],
  }).then(
    () => true,
    () => false,
  );
  return baseHighlighter;
}

/** Starts loading the highlighter ahead of the first code that needs it. */
export function preloadHighlighting() {
  void loadBaseHighlighter();
}

const loadedLanguages = new Set<SupportedLanguages>(['text']);

/** Loads highlighting for the languages that don't have it yet. */
export function preloadLanguages(langs: SupportedLanguages[]) {
  const missing = langs.filter((lang) => !loadedLanguages.has(lang));
  if (missing.length === 0) return NOTHING_TO_HIGHLIGHT;
  return preloadHighlighter({ themes: [THEME.light, THEME.dark], langs: missing }).then(() => {
    for (const lang of missing) loadedLanguages.add(lang);
  });
}

/**
 * For code shown as it streams. Suspends only until the highlighter itself is ready, then returns
 * whether the languages' own highlighting is too. Until it is, render the code as `text`: it
 * appears at once and gains its colors when they load, instead of the block sitting empty.
 *
 * Returns `null` if the highlighter itself could not be loaded. Pierre draws nothing without it,
 * so the caller must then show the code some other way.
 */
export function useLanguagesLoaded(langs: SupportedLanguages[]) {
  const available = use(loadBaseHighlighter());
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const missing = langs.filter((lang) => !loadedLanguages.has(lang));
  const key = missing.join(',');
  // Loads highlighting for languages not seen before, then renders again to apply it. If a
  // language fails to load, its code stays readable as plain text.
  useEffect(() => {
    if (!available || key === '') return;
    let current = true;
    void preloadLanguages(key.split(',')).then(
      () => {
        if (current) rerender();
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [available, key]);
  return available ? missing.length === 0 : null;
}

const LANGUAGES = new Set<string>(
  Object.values(EXTENSION_TO_FILE_FORMAT).filter((language) => language !== undefined),
);

/** Names agents put after a code fence that are neither a language's name nor a file extension. */
const LANGUAGE_ALIASES: Record<string, string> = { shell: 'bash', 'c++': 'cpp', latex: 'tex' };

/** The highlighter's language for a name as written after a code fence, such as `ts` or `python`. */
export function languageOf(name: string | undefined): SupportedLanguages {
  if (!name) return 'text';
  const lower = name.toLowerCase();
  const language = LANGUAGE_ALIASES[lower] ?? lower;
  if (LANGUAGES.has(language)) return language;
  // Anything else is tried as a file extension, which gives `text` when it isn't one.
  return getFiletypeFromFileName(`file.${language}`);
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
export function viewerStyle(themeType: 'light' | 'dark') {
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
}: {
  file: DiffFile;
  /** The parsed patch, or `null` for a binary file. */
  diff: FileDiffMetadata | null;
  themeType: 'light' | 'dark';
  /** Show the old and new file side by side. */
  split?: boolean;
  binaryNotice?: string;
  showFileName?: boolean;
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
      }}
    />
  );
}

/** Code on its own, highlighted like the files in a diff. */
export function CodeFile({
  contents,
  lang,
  themeType,
}: {
  contents: string;
  lang: SupportedLanguages;
  themeType: 'light' | 'dark';
}) {
  return (
    <File
      file={{ name: 'code', contents, lang }}
      options={{
        theme: THEME,
        themeType,
        overflow: 'scroll',
        disableFileHeader: true,
        disableLineNumbers: true,
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
