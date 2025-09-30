import type { Table } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '@prairielearn/browser-utils';

/**
 * @param params
 * @param params.singularLabel - What you are downloading, e.g. "student"
 * @param params.table - The table model
 * @param params.filenameBase - The base filename for the downloads
 * @param params.mapRowToData - A function that maps a row to a record where the
 * keys are the column names, and the values are the cell values. The key order is important,
 * and should match the expected order of the columns in the CSV file. If the function returns null,
 * the row will be skipped.
 */
export function TanstackTableDownloadButton<RowDataModel>({
  table,
  filenameBase,
  mapRowToData,
  singularLabel,
}: {
  table: Table<RowDataModel>;
  filenameBase: string;
  mapRowToData: (row: RowDataModel) => Record<string, string | number | null> | null;
  singularLabel: string;
}) {
  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  const allRowsJSON = allRows.map(mapRowToData).filter((row) => row !== null);
  const filteredRows = table.getRowModel().rows.map((row) => row.original);
  const filteredRowsJSON = filteredRows.map(mapRowToData).filter((row) => row !== null);
  const pluralLabel = `${singularLabel}s`;

  function downloadJSONAsCSV(
    jsonRows: Record<string, string | number | null>[],
    filename: string,
  ): void {
    if (jsonRows.length === 0) {
      throw new Error('No rows to download');
    }

    const header = Object.keys(jsonRows[0]);
    const csvRows = jsonRows.map((row) => Object.values(row));
    downloadAsCSV(header, csvRows, filename);
  }

  return (
    <div class="btn-group">
      <button
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-haspopup="true"
        aria-label={`Download ${pluralLabel} data in various formats`}
        class="btn btn-light btn-sm dropdown-toggle"
      >
        <i aria-hidden="true" class="pe-2 bi bi-download" />
        Download
      </button>
      <ul class="dropdown-menu" role="menu" aria-label="Download options">
        {allRowsJSON.length > 0 && (
          <li role="presentation">
            <button
              class="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download all ${pluralLabel} as CSV file`}
              onClick={() => downloadJSONAsCSV(allRowsJSON, `${filenameBase}.csv`)}
            >
              All {pluralLabel} as CSV
            </button>
          </li>
        )}
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as JSON file`}
            onClick={() => downloadAsJSON(allRowsJSON, `${filenameBase}.json`)}
          >
            All {pluralLabel} as JSON
          </button>
        </li>
        {filteredRowsJSON.length > 0 && (
          <li role="presentation">
            <button
              class="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download filtered ${pluralLabel} as CSV file`}
              onClick={() => downloadJSONAsCSV(filteredRowsJSON, `${filenameBase}_filtered.csv`)}
            >
              Filtered {pluralLabel} as CSV
            </button>
          </li>
        )}
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download filtered ${pluralLabel} as JSON file`}
            onClick={() => downloadAsJSON(filteredRowsJSON, `${filenameBase}_filtered.json`)}
          >
            Filtered {pluralLabel} as JSON
          </button>
        </li>
      </ul>
    </div>
  );
}
