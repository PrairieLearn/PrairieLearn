import type { Table } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '@prairielearn/browser-utils';

export interface TanstackTableCsvCell {
  value: string | string[] | number | null;
  /** The name of the column in the CSV file. */
  name: string;
}

export interface TanstackTableDownloadButtonProps<RowDataModel> {
  table: Table<RowDataModel>;
  filenameBase: string;
  mapRowToData: (row: RowDataModel) => TanstackTableCsvCell[] | null;
  /**
   * Optional function that maps a row to a JSON object for JSON downloads.
   * When provided, JSON downloads use this instead of the CSV cell format.
   * When not provided, the CSV cells are automatically converted to plain objects.
   */
  mapRowToJsonData?: (row: RowDataModel) => Record<string, unknown> | null;
  singularLabel: string;
  pluralLabel: string;
  hasSelection: boolean;
}

function csvCellsToJsonObject(cells: TanstackTableCsvCell[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const nameCount: Record<string, number> = {};
  for (const cell of cells) {
    nameCount[cell.name] = (nameCount[cell.name] ?? 0) + 1;
    const key = nameCount[cell.name] === 1 ? cell.name : `${cell.name}_${nameCount[cell.name]}`;
    result[key] = cell.value;
  }
  return result;
}

/**
 * @param params
 * @param params.table - The table model
 * @param params.filenameBase - The base filename for the downloads
 * @param params.mapRowToData - A function that maps a row to a record where the
 * keys are the column names, and the values are the cell values. The key order is important,
 * and should match the expected order of the columns in the CSV file. If the function returns null,
 * the row will be skipped.
 * @param params.mapRowToJsonData - Optional function that maps a row to a JSON object.
 * When provided, JSON downloads use this for a richer data structure. When not provided,
 * CSV cells are automatically converted to plain objects.
 * @param params.singularLabel - The singular label for a single row in the table, e.g. "student"
 * @param params.pluralLabel - The plural label for multiple rows in the table, e.g. "students"
 * @param params.hasSelection - Whether the table has selection enabled
 */
export function TanstackTableDownloadButton<RowDataModel>({
  table,
  filenameBase,
  mapRowToData,
  mapRowToJsonData,
  singularLabel,
  pluralLabel,
  hasSelection,
}: TanstackTableDownloadButtonProps<RowDataModel>) {
  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  const allRowsCsv = allRows.map(mapRowToData).filter((row) => row !== null);
  const filteredRows = table.getRowModel().rows.map((row) => row.original);
  const filteredRowsCsv = filteredRows.map(mapRowToData).filter((row) => row !== null);
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedRowsCsv = selectedRows.map(mapRowToData).filter((row) => row !== null);

  function getJsonRows(rows: RowDataModel[], csvRows: TanstackTableCsvCell[][]) {
    if (mapRowToJsonData) {
      return rows.map(mapRowToJsonData).filter((row) => row !== null);
    }
    return csvRows.map(csvCellsToJsonObject);
  }

  const allRowsJson = getJsonRows(allRows, allRowsCsv);
  const filteredRowsJson = getJsonRows(filteredRows, filteredRowsCsv);
  const selectedRowsJson = getJsonRows(selectedRows, selectedRowsCsv);

  function downloadCsvCellsAsCSV(csvRows: TanstackTableCsvCell[][], filename: string): void {
    if (csvRows.length === 0) {
      throw new Error('No rows to download');
    }

    const header = csvRows[0].map((cell) => cell.name);
    const rows = csvRows.map((row) =>
      row.map((cell) => (Array.isArray(cell.value) ? cell.value.join('; ') : cell.value)),
    );
    downloadAsCSV(header, rows, filename);
  }

  return (
    <div className="btn-group">
      <button
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-haspopup="true"
        aria-label={`Download ${pluralLabel} data in various formats`}
        className="btn btn-light btn-sm dropdown-toggle"
      >
        <i aria-hidden="true" className="pe-2 bi bi-download" />
        <span className="d-none d-sm-inline">Download</span>
      </button>
      <ul className="dropdown-menu" role="menu" aria-label="Download options">
        <li role="presentation">
          <button
            className="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as CSV file`}
            disabled={allRowsCsv.length === 0}
            onClick={() => downloadCsvCellsAsCSV(allRowsCsv, `${filenameBase}.csv`)}
          >
            All {pluralLabel} ({allRowsCsv.length}) as CSV
          </button>
        </li>
        <li role="presentation">
          <button
            className="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as JSON file`}
            disabled={allRowsJson.length === 0}
            onClick={() => downloadAsJSON(allRowsJson, `${filenameBase}.json`)}
          >
            All {pluralLabel} ({allRowsJson.length}) as JSON
          </button>
        </li>
        {hasSelection && (
          <>
            <li role="presentation">
              <button
                className="dropdown-item"
                type="button"
                role="menuitem"
                aria-label={`Download selected ${pluralLabel} as CSV file`}
                disabled={selectedRowsCsv.length === 0}
                onClick={() =>
                  downloadCsvCellsAsCSV(selectedRowsCsv, `${filenameBase}_selected.csv`)
                }
              >
                Selected {selectedRowsCsv.length === 1 ? singularLabel : pluralLabel} (
                {selectedRowsCsv.length}) as CSV
              </button>
            </li>
            <li role="presentation">
              <button
                className="dropdown-item"
                type="button"
                role="menuitem"
                aria-label={`Download selected ${pluralLabel} as JSON file`}
                disabled={selectedRowsJson.length === 0}
                onClick={() => downloadAsJSON(selectedRowsJson, `${filenameBase}_selected.json`)}
              >
                Selected {selectedRowsJson.length === 1 ? singularLabel : pluralLabel} (
                {selectedRowsJson.length}) as JSON
              </button>
            </li>
          </>
        )}
        <li role="presentation">
          <button
            className="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download filtered ${pluralLabel} as CSV file`}
            disabled={filteredRowsCsv.length === 0}
            onClick={() => downloadCsvCellsAsCSV(filteredRowsCsv, `${filenameBase}_filtered.csv`)}
          >
            Filtered {filteredRowsCsv.length === 1 ? singularLabel : pluralLabel} (
            {filteredRowsCsv.length}) as CSV
          </button>
        </li>
        <li role="presentation">
          <button
            className="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download filtered ${pluralLabel} as JSON file`}
            disabled={filteredRowsJson.length === 0}
            onClick={() => downloadAsJSON(filteredRowsJson, `${filenameBase}_filtered.json`)}
          >
            Filtered {filteredRowsJson.length === 1 ? singularLabel : pluralLabel} (
            {filteredRowsJson.length}) as JSON
          </button>
        </li>
      </ul>
    </div>
  );
}
