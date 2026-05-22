/**
 * Builds the draft editor URL that opens a specific file. `editorUrl` is the
 * base editor URL (e.g. `/pl/course/1/ai_generate_editor/2`).
 */
export function getEditorUrlWithSelectedFile({
  editorUrl,
  filePath,
}: {
  editorUrl: string;
  filePath: string;
}) {
  const params = new URLSearchParams({ file: filePath, tab: 'all-files' });
  return `${editorUrl}?${params.toString()}`;
}

/**
 * Builds the draft editor URL that opens a specific directory. A `null`
 * directory targets the question root.
 */
export function getEditorUrlWithSelectedDirectory({
  editorUrl,
  directory,
}: {
  editorUrl: string;
  directory: string | null;
}) {
  const params = new URLSearchParams({ tab: 'all-files' });
  if (directory != null) params.set('dir', directory);
  return `${editorUrl}?${params.toString()}`;
}
