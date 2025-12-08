import type { Table } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '@prairielearn/browser-utils';

export interface TanstackTableDownloadButtonProps<RowDataModel> {
  table: Table<RowDataModel>;
  filenameBase: string;
  mapRowToData: (row: RowDataModel) => Record<string, string | number | null> | null;
  singularLabel: string;
  pluralLabel: string;
  hasSelection: boolean;
}
/**
 * @param params
 * @param params.table - The table model
 * @param params.filenameBase - The base filename for the downloads
 * @param params.mapRowToData - A function that maps a row to a record where the
 * keys are the column names, and the values are the cell values. The key order is important,
 * and should match the expected order of the columns in the CSV file. If the function returns null,
 * the row will be skipped.
 * @param params.singularLabel - The singular label for a single row in the table, e.g. "student"
 * @param params.pluralLabel - The plural label for multiple rows in the table, e.g. "students"
 * @param params.hasSelection - Whether the table has selection enabled
 */
export function TanstackTableDownloadButton<RowDataModel>({
  table,
  filenameBase,
  mapRowToData,
  singularLabel,
  pluralLabel,
  hasSelection,
}: TanstackTableDownloadButtonProps<RowDataModel>) {
  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  const allRowsJSON = allRows.map(mapRowToData).filter((row) => row !== null);
  const filteredRows = table.getRowModel().rows.map((row) => row.original);
  const filteredRowsJSON = filteredRows.map(mapRowToData).filter((row) => row !== null);
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedRowsJSON = selectedRows.map(mapRowToData).filter((row) => row !== null);

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
        <span class="d-none d-sm-inline">Download</span>
      </button>
      <ul class="dropdown-menu" role="menu" aria-label="Download options">
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as CSV file`}
            disabled={allRowsJSON.length === 0}
            onClick={() => downloadJSONAsCSV(allRowsJSON, `${filenameBase}.csv`)}
          >
            All {pluralLabel} ({allRowsJSON.length}) as CSV
          </button>
        </li>
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as JSON file`}
            disabled={allRowsJSON.length === 0}
            onClick={() => downloadAsJSON(allRowsJSON, `${filenameBase}.json`)}
          >
            All {pluralLabel} ({allRowsJSON.length}) as JSON
          </button>
        </li>
        {hasSelection && (
          <>
            <li role="presentation">
              <button
                class="dropdown-item"
                type="button"
                role="menuitem"
                aria-label={`Download selected ${pluralLabel} as CSV file`}
                disabled={selectedRowsJSON.length === 0}
                onClick={() => downloadJSONAsCSV(selectedRowsJSON, `${filenameBase}_selected.csv`)}
              >
                Selected {selectedRowsJSON.length === 1 ? singularLabel : pluralLabel} (
                {selectedRowsJSON.length}) as CSV
              </button>
            </li>
            <li role="presentation">
              <button
                class="dropdown-item"
                type="button"
                role="menuitem"
                aria-label={`Download selected ${pluralLabel} as JSON file`}
                disabled={selectedRowsJSON.length === 0}
                onClick={() => downloadAsJSON(selectedRowsJSON, `${filenameBase}_selected.json`)}
              >
                Selected {selectedRowsJSON.length === 1 ? singularLabel : pluralLabel} (
                {selectedRowsJSON.length}) as JSON
              </button>
            </li>
          </>
        )}
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download filtered ${pluralLabel} as CSV file`}
            disabled={filteredRowsJSON.length === 0}
            onClick={() => downloadJSONAsCSV(filteredRowsJSON, `${filenameBase}_filtered.csv`)}
          >
            Filtered {filteredRowsJSON.length === 1 ? singularLabel : pluralLabel} (
            {filteredRowsJSON.length}) as CSV
          </button>
        </li>
        <li role="presentation">
          <button
            class="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download filtered ${pluralLabel} as JSON file`}
            disabled={filteredRowsJSON.length === 0}
            onClick={() => downloadAsJSON(filteredRowsJSON, `${filenameBase}_filtered.json`)}
          >
            Filtered {filteredRowsJSON.length === 1 ? singularLabel : pluralLabel} (
            {filteredRowsJSON.length}) as JSON
          </button>
        </li>
      </ul>
    </div>
  );
}
