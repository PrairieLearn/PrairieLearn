import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';

/** The operations every draft file editor exposes for unsaved-changes handling. */
export interface DraftEditorHandle {
  /** Whether the editor currently holds unsaved changes. */
  getHasChanges: () => boolean;
  /** Resets the editor contents to the last saved state. */
  discardChanges: () => void;
}

/**
 * Ambient data for the AI draft editor's file panels. Holds only data —
 * navigation and mutations are hooks, not callbacks threaded through context.
 */
export interface DraftFilesContextValue {
  questionId: string;
  urlPrefix: string;
  /** Whether generation is in progress; the editors are read-only when true. */
  isGenerating: boolean;
  /**
   * Registers a mounted file editor with the unsaved-changes registry (the chat
   * checks it before letting the agent overwrite files). Returns an unregister
   * cleanup.
   */
  registerEditor: (handle: DraftEditorHandle) => () => void;
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

/**
 * Owns the registry of mounted file editors. The provider calls this once and
 * exposes `registerEditor` through the context; `getHasUnsavedChanges` /
 * `discardUnsavedChanges` operate across every registered editor (the chat
 * consults them before letting the agent overwrite files).
 */
export function useDraftEditorRegistry() {
  const [editors] = useState(() => new Set<DraftEditorHandle>());

  const registerEditor = useCallback(
    (handle: DraftEditorHandle) => {
      editors.add(handle);
      return () => {
        editors.delete(handle);
      };
    },
    [editors],
  );

  const getHasUnsavedChanges = useCallback(
    () => [...editors].some((editor) => editor.getHasChanges()),
    [editors],
  );

  const discardUnsavedChanges = useCallback(() => {
    editors.forEach((editor) => editor.discardChanges());
  }, [editors]);

  return { registerEditor, getHasUnsavedChanges, discardUnsavedChanges };
}

/**
 * Registers a file editor with the unsaved-changes registry for as long as the
 * component is mounted. `handle` may be a fresh object each render; the
 * registered wrapper always delegates to the latest one.
 */
export function useRegisterDraftEditor(handle: DraftEditorHandle) {
  const { registerEditor } = useDraftFiles();
  const handleRef = useRef(handle);

  // The registry's methods are only invoked from event handlers, which run
  // after effects have synced the ref to the latest render's closures.
  useEffect(() => {
    handleRef.current = handle;
  });

  useEffect(
    () =>
      registerEditor({
        getHasChanges: () => handleRef.current.getHasChanges(),
        discardChanges: () => handleRef.current.discardChanges(),
      }),
    [registerEditor],
  );
}
