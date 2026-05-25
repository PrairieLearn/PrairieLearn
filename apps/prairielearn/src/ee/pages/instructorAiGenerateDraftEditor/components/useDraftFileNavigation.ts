import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback } from 'react';

import {
  type DraftEditorSelection,
  ROOT_SELECTION,
  selectionParser,
} from '../../../../lib/draft-question-files/selection.js';
import { CODE_EDITOR_TAB_FILES } from '../../../../lib/draft-question-files/urls.js';

/** The AI draft editor's tabs, in display order. */
export const AI_DRAFT_EDITOR_TABS = ['preview', 'files', 'all-files', 'rich-text-editor'] as const;
export type AiDraftEditorTab = (typeof AI_DRAFT_EDITOR_TABS)[number];

/**
 * File-browser navigation for the AI draft editor, backed by the `selection` /
 * `tab` URL params. Opening a file or directory switches to the "All files"
 * tab, except for files in {@link CODE_EDITOR_TAB_FILES} which route to the
 * dedicated "Files" tab (matching `getEditorUrlForSelection`).
 */
export function useDraftFileNavigation() {
  const [selection, setSelection] = useQueryState('selection', selectionParser);
  const [, setActiveTab] = useQueryState('tab', parseAsStringLiteral(AI_DRAFT_EDITOR_TABS));

  const navigateTo = useCallback(
    async (next: DraftEditorSelection) => {
      const isCodeEditorFile = next.kind === 'file' && CODE_EDITOR_TAB_FILES.has(next.path);
      await setSelection(isCodeEditorFile ? ROOT_SELECTION : next);
      await setActiveTab(isCodeEditorFile ? 'files' : 'all-files', { clearOnDefault: false });
    },
    [setSelection, setActiveTab],
  );

  const selectFile = useCallback(
    (filePath: string) => navigateTo({ kind: 'file', path: filePath }),
    [navigateTo],
  );

  const selectDirectory = useCallback(
    (directory: string | null) => navigateTo({ kind: 'dir', path: directory }),
    [navigateTo],
  );

  const clearSelection = useCallback(() => navigateTo(ROOT_SELECTION), [navigateTo]);

  return { selection, selectFile, selectDirectory, clearSelection };
}
