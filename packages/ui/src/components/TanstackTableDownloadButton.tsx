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
   * Maps a row to a JSON object for JSON downloads. When provided, JSON
   * download options are shown in the menu. When not provided, only CSV
   * downloads are available.
   */
  mapRowToJsonData?: (row: RowDataModel) => Record<string, unknown>;
  singularLabel: string;
  pluralLabel: string;
  hasSelection: boolean;
  additionalMenuItems?: React.ReactNode[];
}

/**
 * @param params
 * @param params.table - The table model
 * @param params.filenameBase - The base filename for the downloads
 * @param params.mapRowToData - A function that maps a row to a record where the
 * keys are the column names, and the values are the cell values. The key order is important,
 * and should match the expected order of the columns in the CSV file. If the function returns null,
 * the row will be skipped.
 * @param params.mapRowToJsonData - Maps a row to a JSON object for JSON downloads.
 * When provided, JSON download options are shown. When not provided, only CSV is available.
 * @param params.singularLabel - The singular label for a single row in the table, e.g. "student"
 * @param params.pluralLabel - The plural label for multiple rows in the table, e.g. "students"
 * @param params.hasSelection - Whether the table has selection enabled
 * @param params.additionalMenuItems - Additional menu items to render at the end of the dropdown
 */
export function TanstackTableDownloadButton<RowDataModel>({
  table,
  filenameBase,
  mapRowToData,
  mapRowToJsonData,
  singularLabel,
  pluralLabel,
  hasSelection,
  additionalMenuItems,
}: TanstackTableDownloadButtonProps<RowDataModel>) {
  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  const allRowsCsv = allRows.map(mapRowToData).filter((row) => row !== null);
  const filteredRows = table.getRowModel().rows.map((row) => row.original);
  const filteredRowsCsv = filteredRows.map(mapRowToData).filter((row) => row !== null);
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedRowsCsv = selectedRows.map(mapRowToData).filter((row) => row !== null);

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

  function downloadRowsAsJSON(rows: RowDataModel[], filename: string): void {
    if (!mapRowToJsonData) return;
    downloadAsJSON(rows.map(mapRowToJsonData), filename);
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
        {mapRowToJsonData && (
          <li role="presentation">
            <button
              className="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download all ${pluralLabel} as JSON file`}
              disabled={allRowsCsv.length === 0}
              onClick={() => downloadRowsAsJSON(allRows, `${filenameBase}.json`)}
            >
              All {pluralLabel} ({allRowsCsv.length}) as JSON
            </button>
          </li>
        )}
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
            {mapRowToJsonData && (
              <li role="presentation">
                <button
                  className="dropdown-item"
                  type="button"
                  role="menuitem"
                  aria-label={`Download selected ${pluralLabel} as JSON file`}
                  disabled={selectedRowsCsv.length === 0}
                  onClick={() => downloadRowsAsJSON(selectedRows, `${filenameBase}_selected.json`)}
                >
                  Selected {selectedRowsCsv.length === 1 ? singularLabel : pluralLabel} (
                  {selectedRowsCsv.length}) as JSON
                </button>
              </li>
            )}
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
        {mapRowToJsonData && (
          <li role="presentation">
            <button
              className="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download filtered ${pluralLabel} as JSON file`}
              disabled={filteredRowsCsv.length === 0}
              onClick={() => downloadRowsAsJSON(filteredRows, `${filenameBase}_filtered.json`)}
            >
              Filtered {filteredRowsCsv.length === 1 ? singularLabel : pluralLabel} (
              {filteredRowsCsv.length}) as JSON
            </button>
          </li>
        )}
        {additionalMenuItems?.map((item, index) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <li key={index} role="presentation">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
