import { createSerializer, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback } from 'react';

import {
  type DraftEditorSelection,
  selectionParser,
} from '../../../../lib/draft-question-files/selection.js';
import {
  getDraftEditorUrl,
  resolveSelectionNavigation,
} from '../../../../lib/draft-question-files/urls.js';

import { useDraftFiles } from './draftFilesContext.js';

/** The AI draft editor's tabs, in display order. */
export const AI_DRAFT_EDITOR_TABS = ['preview', 'files', 'all-files', 'rich-text-editor'] as const;
export type AiDraftEditorTab = (typeof AI_DRAFT_EDITOR_TABS)[number];

/** `nuqs` parser for the `tab` URL param, shared by every reader of that state. */
export const tabParser = parseAsStringLiteral(AI_DRAFT_EDITOR_TABS);

/**
 * Serializes the editor's full URL state. Used to build real `href`s for file
 * and directory links from the *live* param values, so middle-click / copy-link
 * reproduces the current state (e.g. the rendered `variant_id`).
 */
const serializeEditorParams = createSerializer({
  selection: selectionParser,
  tab: tabParser,
  variant_id: parseAsString,
});

/**
 * File-browser navigation for the AI draft editor, backed by the `selection` /
 * `tab` URL params. Opening a file or directory switches to the "All files"
 * tab, except for files in `CODE_EDITOR_TAB_FILES` which route to the dedicated
 * "Files" tab; `resolveSelectionNavigation` is the single source of that rule,
 * shared by `navigateTo` and `getSelectionUrl`.
 */
export function useDraftFileNavigation() {
  const { questionId, urlPrefix } = useDraftFiles();
  const [selection, setSelection] = useQueryState('selection', selectionParser);
  const [, setActiveTab] = useQueryState('tab', tabParser);
  const [variantId] = useQueryState('variant_id', parseAsString);

  const navigateTo = useCallback(
    async (next: DraftEditorSelection) => {
      const target = resolveSelectionNavigation(next);
      await setSelection(target.selection);
      await setActiveTab(target.tab);
    },
    [setSelection, setActiveTab],
  );

  const getSelectionUrl = useCallback(
    (next: DraftEditorSelection) => {
      const target = resolveSelectionNavigation(next);
      return serializeEditorParams(getDraftEditorUrl({ urlPrefix, questionId }), {
        selection: target.selection,
        tab: target.tab,
        variant_id: variantId,
      });
    },
    [urlPrefix, questionId, variantId],
  );

  const selectFile = useCallback(
    (filePath: string) => navigateTo({ kind: 'file', path: filePath }),
    [navigateTo],
  );

  const selectDirectory = useCallback(
    (directory: string | null) => navigateTo({ kind: 'dir', path: directory }),
    [navigateTo],
  );

  return { selection, selectFile, selectDirectory, getSelectionUrl };
}
