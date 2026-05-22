/**
 * Builds the draft editor URL that opens a specific file. `editorUrl` is the
 * base editor URL (e.g. `/pl/course/1/ai_generate_editor/2`). `search` is the
 * current page query string; params unrelated to file navigation (e.g.
 * `variant_id`) are carried over.
 */
export function getEditorUrlWithSelectedFile({
  editorUrl,
  filePath,
  search,
}: {
  editorUrl: string;
  filePath: string;
  search: string;
}) {
  const params = new URLSearchParams(search);
  params.set('file', filePath);
  params.set('tab', 'all-files');
  return `${editorUrl}?${params.toString()}`;
}

/**
 * Builds the draft editor URL that opens a specific directory. A `null`
 * directory targets the question root. `search` is the current page query
 * string; params unrelated to file navigation (e.g. `variant_id`) are carried
 * over.
 */
export function getEditorUrlWithSelectedDirectory({
  editorUrl,
  directory,
  search,
}: {
  editorUrl: string;
  directory: string | null;
  search: string;
}) {
  const params = new URLSearchParams(search);
  params.delete('file');
  params.set('tab', 'all-files');
  if (directory == null) {
    params.delete('dir');
  } else {
    params.set('dir', directory);
  }
  return `${editorUrl}?${params.toString()}`;
}
