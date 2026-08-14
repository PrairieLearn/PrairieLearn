import {
  type Cell,
  type CellData,
  type Column,
  type ColumnDef,
  type FilterFn,
  type Header,
  type ReactTable,
  type Row,
  type RowData,
  type Table,
  columnFilteringFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_equals,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_includesString,
  filterFn_weakEquals,
  globalFilteringFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';

export const tanstackTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    arrIncludes: filterFn_arrIncludes,
    equals: filterFn_equals,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
    weakEquals: filterFn_weakEquals,
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  rowSelectionFeature,
  rowPinningFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
});

export type TanstackTableFeatures = typeof tanstackTableFeatures;
/** A table returned by the React adapter's `useTable` hook. */
export type TanstackTableInstance<TData extends RowData> = ReactTable<TanstackTableFeatures, TData>;
/** The core table instance exposed in column header and cell render contexts. */
export type TanstackTableCoreInstance<TData extends RowData> = Table<TanstackTableFeatures, TData>;
export type TanstackTableColumn<TData extends RowData, TValue = any> = Column<
  TanstackTableFeatures,
  TData,
  TValue
>;
export type TanstackTableColumnDef<
  TData extends RowData,
  TValue extends CellData = any,
> = ColumnDef<TanstackTableFeatures, TData, TValue>;
export type TanstackTableHeader<TData extends RowData, TValue extends CellData = any> = Header<
  TanstackTableFeatures,
  TData,
  TValue
>;
export type TanstackTableRow<TData extends RowData> = Row<TanstackTableFeatures, TData>;
export type TanstackTableCell<TData extends RowData, TValue extends CellData = any> = Cell<
  TanstackTableFeatures,
  TData,
  TValue
>;
export type TanstackTableFilterFn<TData extends RowData> = FilterFn<TanstackTableFeatures, TData>;
