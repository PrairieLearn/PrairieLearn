import {
  type Cell,
  type CellData,
  type Column,
  type ColumnDef,
  type ColumnHelper,
  type FilterFn,
  type Header,
  type ReactTable,
  type Row,
  type RowData,
  type Table,
  type TableFeatures,
  type TableOptions,
  columnFilteringFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
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
  useTable,
} from '@tanstack/react-table';

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

const tanstackTableFeatures = tableFeatures({
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

type TanstackTableFeatures = typeof tanstackTableFeatures;

export function createTanstackTableColumnHelper<TData extends RowData>(): ColumnHelper<
  TanstackTableFeatures,
  TData
> {
  return createColumnHelper<TanstackTableFeatures, TData>();
}

export function useTanstackTable<TData extends RowData>(
  options: Omit<TableOptions<TanstackTableFeatures, TData>, 'features'>,
): ReactTable<TanstackTableFeatures, TData> {
  return useTable({ ...options, features: tanstackTableFeatures });
}

/** A table returned by `useTanstackTable`. */
export type TanstackTableInstance<TData extends RowData> = ReactTable<TanstackTableFeatures, TData>;
/** The core table instance exposed in column header and cell render contexts. */
export type TanstackTableCoreInstance<TData extends RowData> = Table<TanstackTableFeatures, TData>;
export type TanstackTableColumn<TData extends RowData, TValue extends CellData = any> = Column<
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
