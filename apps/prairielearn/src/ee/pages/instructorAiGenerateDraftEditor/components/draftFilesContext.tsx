import { createContext, useContext } from 'react';

import type { DraftQuestionFileBrowserActions } from '../../../../components/DraftQuestionFileBrowserActions.js';

/**
 * Ambient state for the draft editor's file panels (the "Files" and "All files"
 * tabs). Provided once by `AiQuestionGenerationEditor`, which owns all of it,
 * and consumed directly by the file browser, the code editors, and the
 * selected-file editor — so these values are not drilled through
 * `QuestionAndFilePreview`, which merely renders the tab that holds them.
 */
export interface DraftFilesContextValue {
  questionId: string;
  urlPrefix: string;
  /** Current page query string; file links preserve its unrelated params. */
  search: string;
  /** URL of the "All files" tab with the current directory selected. */
  allFilesHref: string;
  /** Whether generation is in progress; the editors are read-only when true. */
  isGenerating: boolean;
  /** Upload/rename/delete actions for the file browser. */
  fileBrowserActions: DraftQuestionFileBrowserActions;
  /** Open a file in the "All files" tab editor. */
  selectFile: (filePath: string) => void;
  /** Browse a directory in the "All files" tab (`null` is the question root). */
  selectDirectory: (directory: string | null) => void;
  /** Clear the file selection, returning to the browser listing. */
  clearSelectedFile: () => void;
  /** Refresh the file data after a save and load a fresh question variant. */
  onFilesMutated: () => Promise<unknown>;
  /** Re-read the file data from disk without loading a new variant. */
  refetchFiles: () => Promise<unknown>;
}

const DraftFilesContext = createContext<DraftFilesContextValue | null>(null);

export { DraftFilesContext };

/** Reads the {@link DraftFilesContextValue} provided by `AiQuestionGenerationEditor`. */
export function useDraftFiles(): DraftFilesContextValue {
  const value = useContext(DraftFilesContext);
  if (value == null) {
    throw new Error('useDraftFiles must be used within a DraftFilesContext provider');
  }
  return value;
}
