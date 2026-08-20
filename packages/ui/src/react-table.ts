import type { CellData, RowData, TableFeatures } from '@tanstack/react-table';

/* eslint-disable @typescript-eslint/no-unused-vars -- Declaration merging requires TanStack's exact type parameters. */
declare module '@tanstack/react-table' {
  // https://tanstack.com/table/latest/docs/api/core/column-def#meta

  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** If true, the column will wrap text instead of being truncated. */
    wrapText?: boolean;
    /** If set, this will be used as the label for the column in the column manager. */
    label?: string;
    /** If true, the column will be automatically sized based on the header content. */
    autoSize?: boolean;
    /**
     * When `autoSize` is true, optionally provide a function that selects which
     * row indices to render in the hidden measurement container.
     * Receives the table's raw data array, returns indices of rows to measure.
     * If omitted, only the header is measured (current behavior).
     */
    autoSizeSample?: (data: TData[]) => number[];
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export {};
