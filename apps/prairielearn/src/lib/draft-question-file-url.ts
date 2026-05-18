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
