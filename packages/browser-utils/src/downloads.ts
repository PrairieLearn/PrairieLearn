import { stringify } from 'csv-stringify/browser/esm/sync';

/**
 * Triggers a browser download of a text-based file.
 *
 * @param content The content of the file.
 * @param filename The desired filename.
 * @param mimeType The MIME type of the file.
 */
function downloadTextFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser download of a JSON file.
 *
 * @param data The data to be included in the JSON file.
 * @param filename The desired filename.
 */
export function downloadAsJSON(data: any, filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadTextFile(jsonContent, filename, 'application/json');
}

/**
 * Triggers a browser download of a CSV file.
 *
 * @param header The header row of the CSV.
 * @param data The data rows of the CSV.
 * @param filename The desired filename.
 */
export function downloadAsCSV(header: string[], data: unknown[][], filename: string): void {
  const csvContent = stringify(data, { header: true, columns: header });
  downloadTextFile(csvContent, filename, 'text/csv');
}
