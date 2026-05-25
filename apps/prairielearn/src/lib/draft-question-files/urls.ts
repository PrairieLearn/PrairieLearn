import {
  type DraftEditorSelection,
  ROOT_SELECTION,
  selectionEquals,
  selectionParser,
} from './selection.js';

/**
 * Files edited through the dedicated "Files" tab rather than the per-file
 * editor on the "All files" tab. Clicking these files from the file browser
 * routes to the "Files" tab to avoid having two editor surfaces for the same
 * file (which could desync via independent local edits).
 */
export const CODE_EDITOR_TAB_FILES = new Set(['question.html', 'server.py']);

/**
 * Builds the draft editor URL that opens `selection`. `editorUrl` is the base
 * editor URL (e.g. `/pl/course/1/ai_generate_editor/2`). `search` is the
 * current page query string; params unrelated to the selection / tab (e.g.
 * `variant_id`) are carried over.
 *
 * Files in {@link CODE_EDITOR_TAB_FILES} resolve to the "Files" tab with no
 * `selection` param, since that tab is the dedicated editor for them.
 */
export function getEditorUrlForSelection({
  editorUrl,
  selection,
  search,
}: {
  editorUrl: string;
  selection: DraftEditorSelection;
  search: string;
}) {
  const params = new URLSearchParams(search);
  params.delete('selection');

  if (selection.kind === 'file' && CODE_EDITOR_TAB_FILES.has(selection.path)) {
    params.set('tab', 'files');
  } else {
    params.set('tab', 'all-files');
    if (!selectionEquals(selection, ROOT_SELECTION)) {
      params.set('selection', selectionParser.serialize(selection));
    }
  }
  const queryString = params.toString();
  return queryString === '' ? editorUrl : `${editorUrl}?${queryString}`;
}
