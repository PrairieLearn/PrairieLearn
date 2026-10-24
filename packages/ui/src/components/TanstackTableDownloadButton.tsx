import type { RowData } from '@tanstack/react-table';

import { downloadAsCSV, downloadAsJSON } from '@prairielearn/browser-utils';

import type { TanstackTableInstance } from '../tanstack-table.js';

export interface TanstackTableCsvCell {
  value: string | string[] | number | null;
  /** The name of the column in the CSV file. */
  name: string;
}

export type TanstackTableDownloadButtonOptions<RowDataModel extends RowData> = {
  filenameBase: string;
  isPending?: boolean;
  /** Filters eligible rows before counting, mapping, or loading export data. */
  isRowDownloadable?: (row: RowDataModel) => boolean;
  hasSelection: boolean;
  additionalMenuItems?: React.ReactNode[];
} & (
  | {
      mapRowToData: (row: RowDataModel) => TanstackTableCsvCell[] | null;
      mapRowToJsonData?: (row: RowDataModel) => Record<string, unknown>;
      getCsvData?: never;
      getJsonData?: never;
    }
  | {
      mapRowToData?: never;
      mapRowToJsonData?: never;
      /** Loads mapped CSV data on click. Return null to cancel after handling a loading error. */
      getCsvData: (rows: RowDataModel[]) => Promise<TanstackTableCsvCell[][] | null>;
      /** Loads mapped JSON data on click. Return null to cancel after handling a loading error. */
      getJsonData?: (rows: RowDataModel[]) => Promise<Record<string, unknown>[] | null>;
    }
);

export type TanstackTableDownloadButtonProps<RowDataModel extends RowData> =
  TanstackTableDownloadButtonOptions<RowDataModel> & {
    table: TanstackTableInstance<RowDataModel>;
    singularLabel: string;
    pluralLabel: string;
  };

/**
 * @param params
 * @param params.table - The table model
 * @param params.filenameBase - The base filename for the downloads
 * @param params.isPending - Whether a download is being prepared
 * @param params.isRowDownloadable - Optional eligibility filter shared by counts and both formats
 * @param params.getCsvData - Loads CSV cells for the requested rows instead of using a row mapper
 * @param params.getJsonData - Loads JSON objects for the requested rows and enables JSON downloads
 * @param params.mapRowToData - A synchronous function that maps a row to a record where the
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
export function TanstackTableDownloadButton<RowDataModel extends RowData>({
  table,
  filenameBase,
  isPending = false,
  isRowDownloadable,
  getCsvData,
  getJsonData,
  mapRowToData,
  mapRowToJsonData,
  singularLabel,
  pluralLabel,
  hasSelection,
  additionalMenuItems,
}: TanstackTableDownloadButtonProps<RowDataModel>) {
  function prepareRows(rows: RowDataModel[]) {
    const eligibleRows = isRowDownloadable ? rows.filter(isRowDownloadable) : rows;
    if (!mapRowToData) return { rows: eligibleRows, csvRows: [] };

    const mappedRows = eligibleRows.flatMap((row) => {
      const cells = mapRowToData(row);
      return cells === null ? [] : [{ row, cells }];
    });
    return {
      rows: mappedRows.map(({ row }) => row),
      csvRows: mappedRows.map(({ cells }) => cells),
    };
  }

  const allRows = prepareRows(table.getCoreRowModel().rows.map((row) => row.original));
  const filteredRows = prepareRows(table.getRowModel().rows.map((row) => row.original));
  const selectedRows = prepareRows(
    table.getFilteredSelectedRowModel().rows.map((row) => row.original),
  );

  async function downloadRowsAsCSV(
    { rows, csvRows: mappedRows }: ReturnType<typeof prepareRows>,
    filename: string,
  ): Promise<void> {
    const csvRows = getCsvData ? await getCsvData(rows) : mappedRows;
    if (!csvRows?.length) return;

    const header = csvRows[0].map((cell) => cell.name);
    const values = csvRows.map((row) =>
      row.map((cell) => (Array.isArray(cell.value) ? cell.value.join('; ') : cell.value)),
    );
    downloadAsCSV(header, values, filename);
  }

  async function downloadRowsAsJSON(rows: RowDataModel[], filename: string): Promise<void> {
    const data = getJsonData
      ? await getJsonData(rows)
      : mapRowToJsonData
        ? rows.map(mapRowToJsonData)
        : null;
    if (data) downloadAsJSON(data, filename);
  }

  return (
    <div className="btn-group">
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-haspopup="true"
        aria-label={`Download ${pluralLabel} data in various formats`}
        className="btn btn-light btn-sm dropdown-toggle"
      >
        <i aria-hidden="true" className="pe-2 bi bi-download" />
        <span className="d-none d-sm-inline">{isPending ? 'Preparing download…' : 'Download'}</span>
      </button>
      <ul className="dropdown-menu" role="menu" aria-label="Download options">
        <li role="presentation">
          <button
            className="dropdown-item"
            type="button"
            role="menuitem"
            aria-label={`Download all ${pluralLabel} as CSV file`}
            disabled={isPending || allRows.rows.length === 0}
            onClick={() => downloadRowsAsCSV(allRows, `${filenameBase}.csv`)}
          >
            All {pluralLabel} ({allRows.rows.length}) as CSV
          </button>
        </li>
        {(mapRowToJsonData || getJsonData) && (
          <li role="presentation">
            <button
              className="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download all ${pluralLabel} as JSON file`}
              disabled={isPending || allRows.rows.length === 0}
              onClick={() => downloadRowsAsJSON(allRows.rows, `${filenameBase}.json`)}
            >
              All {pluralLabel} ({allRows.rows.length}) as JSON
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
                disabled={isPending || selectedRows.rows.length === 0}
                onClick={() => downloadRowsAsCSV(selectedRows, `${filenameBase}_selected.csv`)}
              >
                Selected {selectedRows.rows.length === 1 ? singularLabel : pluralLabel} (
                {selectedRows.rows.length}) as CSV
              </button>
            </li>
            {(mapRowToJsonData || getJsonData) && (
              <li role="presentation">
                <button
                  className="dropdown-item"
                  type="button"
                  role="menuitem"
                  aria-label={`Download selected ${pluralLabel} as JSON file`}
                  disabled={isPending || selectedRows.rows.length === 0}
                  onClick={() =>
                    downloadRowsAsJSON(selectedRows.rows, `${filenameBase}_selected.json`)
                  }
                >
                  Selected {selectedRows.rows.length === 1 ? singularLabel : pluralLabel} (
                  {selectedRows.rows.length}) as JSON
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
            disabled={isPending || filteredRows.rows.length === 0}
            onClick={() => downloadRowsAsCSV(filteredRows, `${filenameBase}_filtered.csv`)}
          >
            Filtered {filteredRows.rows.length === 1 ? singularLabel : pluralLabel} (
            {filteredRows.rows.length}) as CSV
          </button>
        </li>
        {(mapRowToJsonData || getJsonData) && (
          <li role="presentation">
            <button
              className="dropdown-item"
              type="button"
              role="menuitem"
              aria-label={`Download filtered ${pluralLabel} as JSON file`}
              disabled={isPending || filteredRows.rows.length === 0}
              onClick={() => downloadRowsAsJSON(filteredRows.rows, `${filenameBase}_filtered.json`)}
            >
              Filtered {filteredRows.rows.length === 1 ? singularLabel : pluralLabel} (
              {filteredRows.rows.length}) as JSON
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
