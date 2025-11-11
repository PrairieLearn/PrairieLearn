import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // https://tanstack.com/table/latest/docs/api/core/column-def#meta
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** If true, the column will wrap text instead of being truncated. */
    wrapText?: boolean;
    /** If set, this will be used as the label for the column in the column manager. */
    label?: string;
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
