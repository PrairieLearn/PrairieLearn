export const MAX_PRINT_FORMS = 26;
export const MAX_COVER_FILES = 10;
export const MAX_COVER_BYTES = 10_000_000;
export const MAX_COVER_PAGES = 100;
export const MAX_PACKET_PAGES = 10_000;
export const MAX_PRINT_EXPORT_UPLOAD_BYTES = 64 * 1024 * 1024;

/** Counts paged.js sheets without a regex, since backtracking over large pages blocks the server. */
export function countPrintSnapshotPages(html: string): number {
  const attribute = 'class="';
  let count = 0;
  let start = html.indexOf(attribute);
  while (start !== -1) {
    const end = html.indexOf('"', start + attribute.length);
    if (end === -1) break;
    const classes = html.slice(start + attribute.length, end).split(/\s+/);
    if (classes.includes('pagedjs_page')) count++;
    start = html.indexOf(attribute, end + 1);
  }
  return Math.max(1, count);
}
