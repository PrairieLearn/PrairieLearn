import { createParser } from 'nuqs';

import { isSafeQuestionRelativePath } from './paths.shared.js';

/**
 * The draft editor's selection state. Either a single file is open (in the
 * editor or preview), or a directory is being browsed. The question root is
 * `{ kind: 'dir', path: null }`.
 */
export type DraftEditorSelection =
  | { kind: 'file'; path: string }
  | { kind: 'dir'; path: string | null };

/** The default selection — the question root. */
export const ROOT_SELECTION: DraftEditorSelection = { kind: 'dir', path: null };

const FILE_PREFIX = 'file:';
const DIR_PREFIX = 'dir:';

function decodeSelection(value: string): DraftEditorSelection | null {
  if (value.startsWith(FILE_PREFIX)) {
    const path = value.slice(FILE_PREFIX.length);
    if (!isSafeQuestionRelativePath(path)) return null;
    return { kind: 'file', path };
  }
  if (value.startsWith(DIR_PREFIX)) {
    const path = value.slice(DIR_PREFIX.length);
    if (path === '') return { kind: 'dir', path: null };
    if (!isSafeQuestionRelativePath(path)) return null;
    return { kind: 'dir', path };
  }
  return null;
}

function encodeSelection(selection: DraftEditorSelection): string {
  return selection.kind === 'file'
    ? `${FILE_PREFIX}${selection.path}`
    : `${DIR_PREFIX}${selection.path ?? ''}`;
}

export function selectionEquals(a: DraftEditorSelection, b: DraftEditorSelection): boolean {
  return a.kind === b.kind && a.path === b.path;
}

/**
 * `nuqs` parser for the `selection` URL param. Defaults to the question root,
 * which `nuqs` serializes by omitting the param entirely (so a clean URL = root).
 */
export const selectionParser = createParser({
  parse: decodeSelection,
  serialize: encodeSelection,
  eq: selectionEquals,
}).withDefault(ROOT_SELECTION);

/**
 * Parses `?selection=` from a raw query value (server-side or from a search
 * string). Malformed values — including non-string values Express's query
 * parser can produce — fall back to the root.
 */
export function parseSelectionQueryParam(raw: unknown): DraftEditorSelection {
  if (typeof raw !== 'string') return ROOT_SELECTION;
  return decodeSelection(raw) ?? ROOT_SELECTION;
}
