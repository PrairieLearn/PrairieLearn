import { type FileDiffMetadata, getSingularPatch } from '@pierre/diffs';
import { FileDiff, Virtualizer } from '@pierre/diffs/react';
import clsx from 'clsx';
import { filesize } from 'filesize';
import { type CSSProperties, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Form, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';

import type { ReviewDiffFile } from '../../lib/course-agent/review-diff.js';

const WIDE_QUERY = '(min-width: 992px)';

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

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

const CHANGES = {
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

interface ParsedFile {
  file: ReviewDiffFile;
  diff: FileDiffMetadata | null;
  additions: number;
  deletions: number;
}

function parseFile(file: ReviewDiffFile): ParsedFile {
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

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function dirname(path: string) {
  return path.slice(0, Math.max(path.lastIndexOf('/'), 0));
}

function LineCounts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-monospace small text-nowrap">
      <span style={{ color: DELETED_COLOR }}>−{deletions}</span>{' '}
      <span style={{ color: ADDED_COLOR }}>+{additions}</span>
    </span>
  );
}

function ChangeIcon({ change }: { change: ReviewDiffFile['change'] }) {
  const { icon, color, label } = CHANGES[change];
  return (
    <>
      <i className={clsx('bi', icon)} style={{ color }} aria-hidden="true" />
      <span className="visually-hidden">{label}:</span>
    </>
  );
}

/** Pierre renders inside a shadow root, so it can't see Bootstrap's color mode. */
function bootstrapThemeType() {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
}

export default function ReviewDiff({ files }: { files: ReviewDiffFile[] }) {
  const id = useId();
  const parsed = useMemo(() => files.map(parseFile), [files]);
  const [preferSplit, setPreferSplit] = useState(true);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
  const sectionsRef = useRef(new Map<string, HTMLElement>());
  const split = wide && preferSplit;
  const themeType = bootstrapThemeType();
  const additions = parsed.reduce((sum, file) => sum + file.additions, 0);
  const deletions = parsed.reduce((sum, file) => sum + file.deletions, 0);
  // Only modified files render split, so the toggle would do nothing without one.
  const canSplit = parsed.some(
    ({ file, diff }) => file.change === 'modified' && diff && diff.hunks.length > 0,
  );

  const jumpTo = (path: string) => {
    const section = sectionsRef.current.get(path);
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  };

  return (
    <div
      className="d-flex flex-column flex-grow-1"
      style={
        {
          minHeight: 0,
          '--review-diff-added': LINE_COLORS[themeType].added,
          '--review-diff-deleted': LINE_COLORS[themeType].deleted,
        } as CSSProperties
      }
    >
      <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom">
        <span>{files.length === 1 ? '1 file changed' : `${files.length} files changed`}</span>
        <LineCounts additions={additions} deletions={deletions} />
        {!wide && files.length > 1 && (
          <Form.Select
            size="sm"
            className="w-auto mw-100"
            aria-label="Jump to file"
            value=""
            onChange={(event) => jumpTo(event.target.value)}
          >
            <option value="" disabled>
              Jump to file…
            </option>
            {files.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path}
              </option>
            ))}
          </Form.Select>
        )}
        {wide && canSplit && (
          <ToggleButtonGroup
            type="radio"
            name={`${id}-layout`}
            size="sm"
            className="ms-auto"
            aria-label="Diff layout"
            value={split ? 'split' : 'unified'}
            onChange={(value: 'split' | 'unified') => setPreferSplit(value === 'split')}
          >
            <ToggleButton id={`${id}-split`} value="split" variant="outline-secondary">
              Split
            </ToggleButton>
            <ToggleButton id={`${id}-unified`} value="unified" variant="outline-secondary">
              Unified
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </div>
      <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
        {wide && files.length > 1 && (
          <nav
            aria-label="Changed files"
            className="border-end overflow-auto position-relative flex-shrink-0 py-2"
            style={{ width: 280 }}
          >
            <ul className="list-unstyled mb-0">
              {parsed.map(({ file, additions, deletions, diff }) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-body text-decoration-none w-100 d-flex align-items-center gap-2 px-3 text-start"
                    title={file.path}
                    onClick={() => jumpTo(file.path)}
                  >
                    <ChangeIcon change={file.change} />
                    <span className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                      <span className="text-truncate">{basename(file.path)}</span>
                      <span className="text-truncate text-muted small">{dirname(file.path)}</span>
                    </span>
                    {diff && <LineCounts additions={additions} deletions={deletions} />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <Virtualizer
          className="flex-grow-1 overflow-auto position-relative"
          contentClassName="d-flex flex-column gap-3 p-3"
          style={
            {
              '--diffs-font-family': 'var(--bs-font-monospace)',
              '--diffs-header-font-family': 'var(--bs-body-font-family)',
            } as CSSProperties
          }
        >
          {parsed.map(({ file, diff }) => (
            <section
              key={file.path}
              ref={(element) => {
                if (element) sectionsRef.current.set(file.path, element);
                else sectionsRef.current.delete(file.path);
              }}
              // Lets keyboard users scroll the diff, which Pierre doesn't make focusable.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              aria-label={`${CHANGES[file.change].label}: ${file.path}`}
              className="border rounded overflow-hidden flex-shrink-0"
              style={{ scrollMarginTop: '1rem' }}
            >
              {diff ? (
                diff.hunks.length > 0 ? (
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
                    }}
                  />
                ) : (
                  <FileNotice
                    file={file}
                    message={file.change === 'modified' ? 'No content changes.' : 'Empty file.'}
                  />
                )
              ) : (
                <FileNotice
                  file={file}
                  message={`Binary file (${filesize(file.bytes)}) can't be previewed.`}
                />
              )}
            </section>
          ))}
        </Virtualizer>
      </div>
    </div>
  );
}

function FileNotice({ file, message }: { file: ReviewDiffFile; message: string }) {
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
