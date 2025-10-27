interface PLFileEditorOptions {
  originalContents?: string;
  readOnly?: boolean;
  aceMode?: string;
  aceTheme?: string;
  fontSize?: number;
  minLines?: number;
  maxLines?: number;
  autoResize?: boolean;
  plOptionFocus?: boolean;
  currentContents?: string;
  preview?: Record<string, (content: string) => string | Promise<string>>;
  preview_type?: string;
}

interface PLFileEditor {
  element: JQuery;
  originalContents: string;
  inputElement: JQuery;
  editorElement: JQuery;
  settingsButton: JQuery;
  modal: JQuery;
  saveSettingsButton: JQuery;
  closeSettingsButton: JQuery;
  restoreOriginalButton: JQuery;
  restoreOriginalConfirmContainer: JQuery;
  restoreOriginalConfirm: JQuery;
  restoreOriginalCancel: JQuery;
  editor: AceAjax.Editor;
  plOptionFocus?: boolean;
  preview: Record<string, (content: string) => string | Promise<string>>;

  syncSettings(): void;
  updatePreview(preview_type: string): Promise<void>;
  initSettingsButton(uuid: string): void;
  initRestoreOriginalButton(): void;
  syncFileToHiddenInput(): void;
  setEditorContents(contents: string, options?: { resetUndo?: boolean }): void;
  b64DecodeUnicode(str: string): string;
}
