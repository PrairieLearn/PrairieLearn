import { createContext, use } from 'react';

/**
 * Ambient data for the AI draft editor's file panels. Holds only data —
 * navigation and mutations are hooks, not callbacks threaded through context.
 */
export interface DraftFilesContextValue {
  questionId: string;
  urlPrefix: string;
  /** Current page query string; file links preserve its unrelated params. */
  search: string;
  /** Whether generation is in progress; the editors are read-only when true. */
  isGenerating: boolean;
  /** CSRF token for the multipart file-upload route. */
  uploadCsrfToken: string;
}

const DraftFilesContext = createContext<DraftFilesContextValue | null>(null);

export { DraftFilesContext };

/** Reads the {@link DraftFilesContextValue} provided by `AiQuestionGenerationEditor`. */
export function useDraftFiles(): DraftFilesContextValue {
  const value = use(DraftFilesContext);
  if (value == null) {
    throw new Error('useDraftFiles must be used within a DraftFilesContext provider');
  }
  return value;
}
