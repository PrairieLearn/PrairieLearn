import {
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { TanstackTableCard, TanstackTableEmptyState } from '@prairielearn/ui';

import { JobStatus } from '../../components/JobStatus.js';
import { StaffJobSequenceSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';

export const AssessmentLogRowSchema = z.object({
  job_sequence: StaffJobSequenceSchema,
  user_uid: z.string(),
  category: z.enum(['regrade', 'upload']),
});
export type AssessmentLogRow = z.infer<typeof AssessmentLogRowSchema>;

const CATEGORY_LABELS: Record<AssessmentLogRow['category'], string> = {
  regrade: 'Regrade',
  upload: 'Upload',
};

const columnHelper = createColumnHelper<AssessmentLogRow>();

export function AssessmentLogsTable({
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

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => CATEGORY_LABELS[row.category], {
        id: 'category',
        header: 'Type',
        size: 110,
        cell: (info) => {
          const { category } = info.row.original;
          return (
            <span
              className={clsx('badge', category === 'regrade' ? 'text-bg-info' : 'text-bg-secondary')}
            >
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
        size: 200,
        sortingFn: 'datetime',
        enableGlobalFilter: false,
        cell: (info) => {
          const date = info.getValue();
          return date ? formatDate(date, timezone) : '—';
        },
      }),
      columnHelper.accessor((row) => row.job_sequence.description ?? '', {
        id: 'description',
        header: 'Description',
        size: 340,
      }),
      columnHelper.accessor((row) => row.user_uid, {
        id: 'user',
        header: 'User',
        size: 200,
      }),
      columnHelper.accessor((row) => row.job_sequence.status, {
        id: 'status',
        header: 'Status',
        size: 120,
        cell: (info) => <JobStatus status={info.getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 110,
        enableSorting: false,
        enableHiding: false,
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

  const table = useReactTable({
    data: logs,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.job_sequence.id,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
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
        emptyState: (
          <TanstackTableEmptyState iconName="bi-clock-history">
            No regrading or score-upload activity yet.
          </TanstackTableEmptyState>
        ),
        noResultsState: (
          <TanstackTableEmptyState iconName="bi-search">
            No logs match your search.
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
    />
  );
}

AssessmentLogsTable.displayName = 'AssessmentLogsTable';
