import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback } from 'react';

/** The AI draft editor's tabs, in display order. */
export const AI_DRAFT_EDITOR_TABS = ['preview', 'files', 'all-files', 'rich-text-editor'] as const;
export type AiDraftEditorTab = (typeof AI_DRAFT_EDITOR_TABS)[number];

/**
 * File-browser navigation for the AI draft editor, backed by the `file` / `dir`
 * / `tab` URL params. Opening a file or directory switches to the "All files" tab.
 */
export function useDraftFileNavigation() {
  const [selectedFilePath, setSelectedFilePath] = useQueryState('file', parseAsString);
  const [selectedDirectory, setSelectedDirectory] = useQueryState('dir', parseAsString);
  const [, setActiveTab] = useQueryState('tab', parseAsStringLiteral(AI_DRAFT_EDITOR_TABS));

  const selectFile = useCallback(
    async (filePath: string) => {
      await setSelectedFilePath(filePath);
      await setActiveTab('all-files', { clearOnDefault: false });
    },
    [setSelectedFilePath, setActiveTab],
  );

  const selectDirectory = useCallback(
    async (directory: string | null) => {
      await setSelectedFilePath(null);
      await setSelectedDirectory(directory);
      await setActiveTab('all-files', { clearOnDefault: false });
    },
    [setSelectedFilePath, setSelectedDirectory, setActiveTab],
  );

  const clearSelectedFile = useCallback(async () => {
    await setActiveTab('all-files', { clearOnDefault: false });
    await setSelectedFilePath(null);
  }, [setSelectedFilePath, setActiveTab]);

  return { selectedFilePath, selectedDirectory, selectFile, selectDirectory, clearSelectedFile };
}
