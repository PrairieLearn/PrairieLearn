import {
  type ColumnSizingState,
  type Header,
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import {
  type ColumnFilterEntry,
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  NuqsAdapter,
  TanstackTableCard,
  TanstackTableEmptyState,
  applyMultiSelectFilter,
  parseAsMultiSelectFilter,
  useColumnFilters,
} from '@prairielearn/ui';

import { JobStatus } from '../../components/JobStatus.js';
import { StaffJobSequenceSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';

export const AssessmentLogRowSchema = z.object({
  job_sequence: StaffJobSequenceSchema,
  user_uid: z.string(),
  category: z.enum(['regrade', 'upload']),
});
export type AssessmentLogRow = z.infer<typeof AssessmentLogRowSchema>;

type CategoryValue = AssessmentLogRow['category'];
type StatusValue = NonNullable<AssessmentLogRow['job_sequence']['status']>;

const CATEGORY_LABELS: Record<CategoryValue, string> = {
  regrade: 'Regrade',
  upload: 'Upload',
};
const CATEGORY_COLORS: Record<CategoryValue, string> = {
  regrade: 'blue1',
  upload: 'gray2',
};
const CATEGORY_VALUES = ['regrade', 'upload'] as const satisfies readonly CategoryValue[];
const STATUS_VALUES = [
  'Running',
  'Stopping',
  'Stopped',
  'Success',
  'Error',
] as const satisfies readonly StatusValue[];

// Number of rows to render in the hidden measurement container when auto-sizing
// a column. We sample the widest rows so the column fits its longest content.
const AUTO_SIZE_SAMPLE_COUNT = 30;

function sampleWidest(rows: AssessmentLogRow[], measure: (row: AssessmentLogRow) => number) {
  return rows
    .map((row, index) => ({ width: measure(row), index }))
    .sort((a, b) => b.width - a.width)
    .slice(0, AUTO_SIZE_SAMPLE_COUNT)
    .map(({ index }) => index);
}

const columnHelper = createColumnHelper<AssessmentLogRow>();

export function AssessmentLogsTable({
  logs,
  courseInstanceId,
  timezone,
  search,
}: {
  logs: AssessmentLogRow[];
  courseInstanceId: string;
  timezone: string;
  search: string;
}) {
  return (
    <NuqsAdapter search={search}>
      <AssessmentLogsTableInner
        logs={logs}
        courseInstanceId={courseInstanceId}
        timezone={timezone}
      />
    </NuqsAdapter>
  );
}

AssessmentLogsTable.displayName = 'AssessmentLogsTable';

function AssessmentLogsTableInner({
  logs,
  courseInstanceId,
  timezone,
}: {
  logs: AssessmentLogRow[];
  courseInstanceId: string;
  timezone: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const filterRegistry = useMemo(() => {
    const registry: Record<
      string,
      | ColumnFilterEntry<MultiSelectFilterValue<CategoryValue>>
      | ColumnFilterEntry<MultiSelectFilterValue<StatusValue>>
    > = {
      category: {
        parser: parseAsMultiSelectFilter(CATEGORY_VALUES),
        defaultValue: { values: [], mode: 'include' },
      },
      status: {
        parser: parseAsMultiSelectFilter(STATUS_VALUES),
        defaultValue: { values: [], mode: 'include' },
      },
    };
    return registry;
  }, []);
  const { columnFilters, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => CATEGORY_LABELS[row.category], {
        id: 'category',
        header: 'Type',
        meta: {
          label: 'Type',
          autoSize: true,
          autoSizeSample: (rows) => sampleWidest(rows, (r) => CATEGORY_LABELS[r.category].length),
        },
        filterFn: (row, _columnId, filter: MultiSelectFilterValue<CategoryValue>) =>
          applyMultiSelectFilter(filter, (values) => values.includes(row.original.category)),
        cell: (info) => {
          const { category } = info.row.original;
          return (
            <span className={`badge color-${CATEGORY_COLORS[category]}`}>
              {CATEGORY_LABELS[category]}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.job_sequence.number, {
        id: 'number',
        header: 'Number',
        size: 100,
      }),
      columnHelper.accessor((row) => row.job_sequence.start_date, {
        id: 'date',
        header: 'Date',
        sortingFn: 'datetime',
        enableGlobalFilter: false,
        meta: {
          autoSize: true,
          autoSizeSample: (rows) => rows.slice(0, 5).map((_, index) => index),
        },
        cell: (info) => {
          const date = info.getValue();
          return date ? formatDate(date, timezone) : '—';
        },
      }),
      columnHelper.accessor((row) => row.job_sequence.description ?? '', {
        id: 'description',
        header: 'Description',
        meta: {
          autoSize: true,
          autoSizeSample: (rows) =>
            sampleWidest(rows, (r) => (r.job_sequence.description ?? '').length),
        },
      }),
      columnHelper.accessor((row) => row.user_uid, {
        id: 'user',
        header: 'User',
        meta: {
          autoSize: true,
          autoSizeSample: (rows) => sampleWidest(rows, (r) => r.user_uid.length),
        },
      }),
      columnHelper.accessor((row) => row.job_sequence.status, {
        id: 'status',
        header: 'Status',
        meta: {
          label: 'Status',
          autoSize: true,
          autoSizeSample: (rows) =>
            sampleWidest(rows, (r) => (r.job_sequence.status ?? '').length),
        },
        filterFn: (row, _columnId, filter: MultiSelectFilterValue<StatusValue>) =>
          applyMultiSelectFilter(filter, (values) => {
            const status = row.original.job_sequence.status;
            return status != null && values.includes(status);
          }),
        cell: (info) => <JobStatus status={info.getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableHiding: false,
        meta: {
          autoSize: true,
          autoSizeSample: (rows) => rows.slice(0, 1).map((_, index) => index),
        },
        cell: (info) => (
          <a
            href={getCourseInstanceJobSequenceUrl(
              courseInstanceId,
              info.row.original.job_sequence.id,
            )}
            className="btn btn-xs btn-info"
          >
            Details
          </a>
        ),
      }),
    ],
    [courseInstanceId, timezone],
  );

  const filters = useMemo(
    () => ({
      category: ({ header }: { header: Header<AssessmentLogRow, unknown> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={CATEGORY_VALUES}
          renderValueLabel={({ value }) => <span>{CATEGORY_LABELS[value]}</span>}
        />
      ),
      status: ({ header }: { header: Header<AssessmentLogRow, unknown> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={STATUS_VALUES}
          renderValueLabel={({ value }) => <JobStatus status={value} />}
        />
      ),
    }),
    [],
  );

  const table = useReactTable({
    data: logs,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.job_sequence.id,
    state: { sorting, globalFilter, columnVisibility, columnFilters, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 80,
      size: 150,
      maxSize: 600,
      enableSorting: true,
      enableHiding: true,
    },
  });

  return (
    <TanstackTableCard
      table={table}
      title="Assessment logs"
      className="h-100"
      singularLabel="log"
      pluralLabel="logs"
      globalFilter={{ placeholder: 'Search logs...' }}
      tableOptions={{
        filters,
        emptyState: (
          <TanstackTableEmptyState iconName="bi-clock-history">
            No regrading or score-upload activity yet.
          </TanstackTableEmptyState>
        ),
        noResultsState: (
          <TanstackTableEmptyState iconName="bi-search">
            No logs match your search or filters.
          </TanstackTableEmptyState>
        ),
      }}
      downloadButtonOptions={{
        filenameBase: 'assessment_logs',
        hasSelection: false,
        mapRowToData: (row) => [
          { name: 'Type', value: CATEGORY_LABELS[row.category] },
          { name: 'Number', value: row.job_sequence.number },
          {
            name: 'Date',
            value: row.job_sequence.start_date
              ? formatDate(row.job_sequence.start_date, timezone)
              : null,
          },
          { name: 'Description', value: row.job_sequence.description },
          { name: 'User', value: row.user_uid },
          { name: 'Status', value: row.job_sequence.status },
        ],
      }}
      onResetColumnFilters={onResetColumnFilters}
    />
  );
}
