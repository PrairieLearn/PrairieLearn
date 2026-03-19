import type { RankingInfo } from '@tanstack/match-sorter-utils';
import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // https://tanstack.com/table/latest/docs/api/core/column-def#meta
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
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

  /** Extends the default FilterMeta to include ranking information from `@tanstack/match-sorter-utils` for fuzzy filtering. */
  interface FilterMeta {
    itemRank?: RankingInfo;
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
