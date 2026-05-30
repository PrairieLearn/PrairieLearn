import { type QueryFunction, useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  type Table,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import { type ReactNode, useMemo, useState } from 'react';
import { Button, ButtonGroup, Modal } from 'react-bootstrap';

import {
  IndeterminateCheckbox,
  TanstackTableCard,
  type TanstackTableCsvCell,
  TanstackTableEmptyState,
  extractLeafColumnIds,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { Scorebar } from '../../../components/Scorebar.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { type HelpModalId, HelpModals } from './HelpModals.js';
import { InstanceSelectionToolbar } from './InstanceSelectionToolbar.js';
import { TimeLimitEditForm } from './TimeLimitEditForm.js';
import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

const columnHelper = createColumnHelper<AssessmentInstanceRow>();
const DEFAULT_SORT: SortingState = [];

function listText(list: (string | null)[] | null): string {
  if (!list?.[0]) return '(empty)';
  return list.filter((v): v is string => v != null).join(', ');
}

function uniqueListText(list: string[] | null): string {
  if (!list?.[0]) return '(empty)';
  return Array.from(new Set(list)).join(', ');
}

function HelpHeader({
  label,
  modalId,
  onShowHelp,
}: {
  label: string;
  modalId: HelpModalId;
  onShowHelp: (id: HelpModalId) => void;
}) {
  return (
    <span className="text-nowrap">
      {label}{' '}
      <button
        type="button"
        className="btn btn-xs btn-ghost p-0"
        aria-label={`${label} help`}
        onClick={(e) => {
          e.stopPropagation();
          onShowHelp(modalId);
        }}
      >
        <i className="bi bi-question-circle-fill" aria-hidden="true" />
      </button>
    </span>
  );
}

function SelectAllCheckbox({ table }: { table: Table<AssessmentInstanceRow> }) {
  return (
    <IndeterminateCheckbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      aria-label="Select all instances"
      onChange={() => table.toggleAllPageRowsSelected()}
    />
  );
}

const globalFilterFn: FilterFn<AssessmentInstanceRow> = (row, _columnId, value) => {
  const search = String(value).toLowerCase();
  if (!search) return true;
  const r = row.original;
  const haystack: (string | null | undefined)[] = [
    r.group?.name,
    r.user?.uid,
    r.user?.name,
    r.role,
    ...(r.uid_list ?? []),
    ...(r.user_name_list ?? []),
    ...(r.group_roles ?? []),
  ];
  return haystack.some((field) => field?.toLowerCase().includes(search));
};

export function AssessmentInstancesTable<TQueryKey extends readonly unknown[]>({
  initialRows,
  listQueryOptions,
  urlPrefix,
  assessmentSetAbbr,
  assessmentNumber,
  groupWork,
  multipleInstance,
  timezone,
  canEdit,
  onActionSuccess,
}: {
  initialRows: AssessmentInstanceRow[];
  listQueryOptions: {
    queryKey: TQueryKey;
    queryFn?: QueryFunction<AssessmentInstanceRow[], TQueryKey>;
  };
  urlPrefix: string;
  assessmentSetAbbr: string;
  assessmentNumber: string;
  groupWork: boolean;
  multipleInstance: boolean;
  timezone: string;
  canEdit: boolean;
  onActionSuccess: (message: string) => void;
}) {
  const invalidateList = useInvalidateAssessmentInstancesList();

  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [studentsOnly, setStudentsOnly] = useQueryState(
    'studentsOnly',
    parseAsBoolean.withDefault(false),
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [helpModal, setHelpModal] = useState<HelpModalId | null>(null);
  const [timeLimitRow, setTimeLimitRow] = useState<AssessmentInstanceRow | null>(null);
  const { createCheckboxProps } = useShiftClickCheckbox<AssessmentInstanceRow>();

  const { data: rows = initialRows } = useQuery({
    ...listQueryOptions,
    queryFn: listQueryOptions.queryFn ?? (() => Promise.resolve(initialRows)),
    staleTime: Infinity,
    initialData: initialRows,
  });

  const data = useMemo(() => {
    if (!studentsOnly) return rows;
    return rows.filter((row) =>
      groupWork ? row.group_roles?.includes('Student') : row.role === 'Student',
    );
  }, [rows, studentsOnly, groupWork]);

  const columns = useMemo(() => {
    const cols: ColumnDef<AssessmentInstanceRow, any>[] = [];

    if (canEdit) {
      cols.push(
        columnHelper.display({
          id: 'select',
          header: ({ table }) => <SelectAllCheckbox table={table} />,
          cell: ({ row, table }) => (
            <input
              type="checkbox"
              aria-label={`Select instance ${row.original.assessment_instance.id}`}
              {...createCheckboxProps(row, table)}
            />
          ),
          size: 40,
          minSize: 40,
          maxSize: 40,
          enableSorting: false,
          enableHiding: false,
          enablePinning: true,
        }),
      );
    }

    cols.push(
      columnHelper.accessor((row) => row.assessment_instance.id, {
        id: 'identity',
        header: 'Instance',
        enableHiding: false,
        cell: (info) => {
          const row = info.row.original;
          const name = groupWork ? row.group?.name : row.user?.uid;
          let number = '';
          if (!multipleInstance) {
            number = row.assessment_instance.number === 1 ? '' : `#${row.assessment_instance.number}`;
          }
          return (
            <a
              className="text-nowrap"
              href={`${urlPrefix}/assessment_instance/${row.assessment_instance.id}`}
            >
              {assessmentSetAbbr}
              {assessmentNumber}
              {number} for {name}
            </a>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          const nameA = (groupWork ? a.group?.name : a.user?.uid) ?? '';
          const nameB = (groupWork ? b.group?.name : b.user?.uid) ?? '';
          const idA = (groupWork ? a.group?.id : a.user?.id) ?? '';
          const idB = (groupWork ? b.group?.id : b.user?.id) ?? '';
          let compare = nameA.localeCompare(nameB);
          if (!compare) compare = Number.parseInt(idA) - Number.parseInt(idB);
          if (!compare) compare = a.assessment_instance.number - b.assessment_instance.number;
          if (!compare) {
            compare =
              Number.parseInt(a.assessment_instance.id) - Number.parseInt(b.assessment_instance.id);
          }
          return compare;
        },
        size: 250,
      }),
    );

    if (groupWork) {
      cols.push(
        columnHelper.accessor((row) => row.group?.name ?? null, {
          id: 'group_name',
          header: 'Name',
          cell: (info) => info.getValue(),
          size: 150,
        }),
        columnHelper.accessor((row) => listText(row.uid_list), {
          id: 'uid_list',
          header: 'Group members',
          cell: (info) => <small>{info.getValue()}</small>,
          meta: { label: 'Group members' },
          size: 200,
        }),
        columnHelper.accessor((row) => listText(row.user_name_list), {
          id: 'user_name_list',
          header: 'Group member names',
          cell: (info) => <small>{info.getValue()}</small>,
          meta: { label: 'Group member names' },
          size: 200,
        }),
        columnHelper.accessor((row) => uniqueListText(row.group_roles), {
          id: 'group_roles',
          header: () => <HelpHeader label="Roles" modalId="roles" onShowHelp={setHelpModal} />,
          cell: (info) => <small>{info.getValue()}</small>,
          meta: { label: 'Roles' },
          size: 150,
        }),
      );
    } else {
      cols.push(
        columnHelper.accessor((row) => row.user?.uid ?? null, {
          id: 'uid',
          header: 'UID',
          cell: (info) => info.getValue(),
          meta: { label: 'UID' },
          size: 200,
        }),
        columnHelper.accessor((row) => row.user?.name ?? null, {
          id: 'name',
          header: 'Name',
          cell: (info) => info.getValue(),
          size: 200,
        }),
        columnHelper.accessor((row) => row.role, {
          id: 'role',
          header: () => <HelpHeader label="Role" modalId="roles" onShowHelp={setHelpModal} />,
          cell: (info) => info.getValue(),
          meta: { label: 'Role' },
          size: 120,
        }),
      );
    }

    cols.push(
      columnHelper.accessor((row) => row.assessment_instance.number, {
        id: 'number',
        header: 'Instance #',
        cell: (info) => info.getValue(),
        meta: { label: 'Instance #' },
        size: 100,
      }),
      columnHelper.accessor((row) => row.assessment_instance.score_perc, {
        id: 'score_perc',
        header: 'Score',
        cell: (info) => <Scorebar score={info.getValue()} />,
        size: 150,
      }),
      columnHelper.accessor((row) => row.assessment_instance.date, {
        id: 'date',
        header: 'Date started',
        cell: (info) => <span className="text-nowrap">{info.row.original.date_formatted}</span>,
        sortingFn: 'datetime',
        meta: { label: 'Date started' },
        size: 180,
      }),
      columnHelper.accessor((row) => row.assessment_instance.duration, {
        id: 'duration',
        header: () => <HelpHeader label="Duration" modalId="duration" onShowHelp={setHelpModal} />,
        cell: (info) => (
          <span className="text-nowrap">{info.row.original.duration_formatted}</span>
        ),
        meta: { label: 'Duration' },
        size: 130,
      }),
      columnHelper.accessor((row) => row.time_remaining_sec, {
        id: 'time_remaining',
        header: () => (
          <HelpHeader label="Remaining" modalId="timeRemaining" onShowHelp={setHelpModal} />
        ),
        cell: (info) => {
          const row = info.row.original;
          return (
            <span className="text-nowrap">
              {row.time_remaining}
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs ms-1"
                  aria-label="Change time limit"
                  onClick={() => setTimeLimitRow(row)}
                >
                  <i className="bi bi-pencil-square" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          return (
            Number(a.assessment_instance.open) - Number(b.assessment_instance.open) ||
            (a.time_remaining_sec ?? 0) - (b.time_remaining_sec ?? 0)
          );
        },
        meta: { label: 'Remaining' },
        size: 130,
      }),
      columnHelper.accessor((row) => row.total_time_sec, {
        id: 'total_time',
        header: 'Total time limit',
        cell: (info) => <span className="text-nowrap">{info.row.original.total_time}</span>,
        meta: { label: 'Total time limit' },
        size: 150,
      }),
      columnHelper.accessor((row) => row.assessment_instance.client_fingerprint_id_change_count, {
        id: 'client_fingerprint_id_change_count',
        header: () => (
          <HelpHeader label="Fingerprint changes" modalId="fingerprint" onShowHelp={setHelpModal} />
        ),
        cell: (info) => info.getValue(),
        meta: { label: 'Fingerprint changes' },
        size: 150,
      }),
    );

    return cols;
  }, [
    canEdit,
    groupWork,
    multipleInstance,
    urlPrefix,
    assessmentSetAbbr,
    assessmentNumber,
    createCheckboxProps,
  ]);

  const allColumnIds = useMemo(() => extractLeafColumnIds(columns), [columns]);

  const defaultColumnVisibility = useMemo(() => {
    const hidden = new Set(['uid', 'number', 'total_time', 'group_name', 'user_name_list']);
    if (groupWork) hidden.add('client_fingerprint_id_change_count');
    const visibility: Record<string, boolean> = {};
    for (const id of allColumnIds) visibility[id] = !hidden.has(id);
    return visibility;
  }, [allColumnIds, groupWork]);

  const columnVisibilityParser = useMemo(
    () =>
      parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
    [allColumnIds, defaultColumnVisibility],
  );
  const [columnVisibility, setColumnVisibility] = useQueryState('columns', columnVisibilityParser);

  const defaultPinning: ColumnPinningState = {
    left: canEdit ? ['select', 'identity'] : ['identity'],
    right: [],
  };
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(defaultPinning),
  );

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    globalFilterFn,
    enableRowSelection: canEdit,
    getRowId: (row) => row.assessment_instance.id,
    state: {
      sorting,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
      rowSelection,
    },
    initialState: {
      columnPinning: defaultPinning,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 80,
      size: 150,
      maxSize: 500,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  const selectionToolbar =
    canEdit && selectedRows.length > 0 ? (
      <InstanceSelectionToolbar
        selectedRows={selectedRows}
        clearSelection={() => setRowSelection({})}
        urlPrefix={urlPrefix}
        timezone={timezone}
        onActionSuccess={onActionSuccess}
      />
    ) : null;

  const headerButtons: ReactNode = (
    <>
      {selectionToolbar}
      <ButtonGroup>
        <Button
          size="sm"
          variant={studentsOnly ? 'primary' : 'light'}
          active={studentsOnly}
          onClick={() => setStudentsOnly(!studentsOnly)}
        >
          <i className="bi bi-mortarboard me-2" aria-hidden="true" />
          Students only
        </Button>
        <Button
          size="sm"
          variant="light"
          aria-label="Refresh instances"
          onClick={() => invalidateList()}
        >
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
          Refresh
        </Button>
      </ButtonGroup>
    </>
  );

  return (
    <>
      <TanstackTableCard
        table={table}
        title="Students"
        className="h-100"
        singularLabel="instance"
        pluralLabel="instances"
        headerButtons={headerButtons}
        downloadButtonOptions={{
          filenameBase: 'assessment_instances',
          hasSelection: canEdit,
          mapRowToData: (row: AssessmentInstanceRow): TanstackTableCsvCell[] => [
            { name: 'UID', value: row.user?.uid ?? null },
            { name: 'Name', value: row.user?.name ?? null },
            { name: 'Role', value: row.role },
            { name: 'Group name', value: row.group?.name ?? null },
            { name: 'Group members', value: row.uid_list?.join(', ') ?? null },
            { name: 'Instance', value: row.assessment_instance.number },
            { name: 'Score (%)', value: row.assessment_instance.score_perc },
            { name: 'Points', value: row.assessment_instance.points },
            { name: 'Max points', value: row.assessment_instance.max_points },
            { name: 'Date started', value: row.date_formatted },
            { name: 'Duration', value: row.duration_formatted },
            { name: 'Time remaining', value: row.time_remaining },
            { name: 'Total time limit', value: row.total_time },
            {
              name: 'Fingerprint changes',
              value: row.assessment_instance.client_fingerprint_id_change_count,
            },
          ],
          mapRowToJsonData: (row: AssessmentInstanceRow) => ({
            assessment_instance_id: row.assessment_instance.id,
            uid: row.user?.uid ?? null,
            name: row.user?.name ?? null,
            role: row.role,
            group_name: row.group?.name ?? null,
            uid_list: row.uid_list,
            number: row.assessment_instance.number,
            score_perc: row.assessment_instance.score_perc,
            points: row.assessment_instance.points,
            max_points: row.assessment_instance.max_points,
            date: row.assessment_instance.date,
            duration: row.assessment_instance.duration,
            time_remaining: row.time_remaining,
            total_time: row.total_time,
            open: row.assessment_instance.open,
            client_fingerprint_id_change_count:
              row.assessment_instance.client_fingerprint_id_change_count,
          }),
        }}
        globalFilter={{
          placeholder: groupWork ? 'Search by group, member, role...' : 'Search by UID, name...',
        }}
        tableOptions={{
          emptyState: (
            <TanstackTableEmptyState iconName="bi-person">
              No assessment instances yet.
            </TanstackTableEmptyState>
          ),
          noResultsState: (
            <TanstackTableEmptyState iconName="bi-search">
              No assessment instances found matching your search criteria.
            </TanstackTableEmptyState>
          ),
        }}
      />

      <HelpModals show={helpModal} onHide={() => setHelpModal(null)} />

      {timeLimitRow ? (
        <TimeLimitModal
          row={timeLimitRow}
          timezone={timezone}
          onHide={() => setTimeLimitRow(null)}
          onSuccess={() => {
            onActionSuccess('Updated the time limit.');
            setTimeLimitRow(null);
          }}
        />
      ) : null}
    </>
  );
}

function TimeLimitModal({
  row,
  timezone,
  onHide,
  onSuccess,
}: {
  row: AssessmentInstanceRow;
  timezone: string;
  onHide: () => void;
  onSuccess: () => void;
}) {
  const open = row.assessment_instance.open === true;
  return (
    <Modal show onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{open ? 'Change time limit' : 'Re-open instance'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <TimeLimitEditForm
          mode="single"
          assessmentInstanceIds={[row.assessment_instance.id]}
          hasOpenInstance={open && row.time_remaining_sec == null}
          hasClosedInstance={!open}
          hasTimeLimitInstance={open && row.time_remaining_sec != null}
          singleRow={{
            open,
            total_time: row.total_time,
            total_time_sec: row.total_time_sec,
            time_remaining: row.time_remaining,
            time_remaining_sec: row.time_remaining_sec,
            date:
              row.assessment_instance.date != null
                ? new Date(row.assessment_instance.date).toISOString()
                : '',
          }}
          timezone={timezone}
          onCancel={onHide}
          onSuccess={onSuccess}
        />
      </Modal.Body>
    </Modal>
  );
}

AssessmentInstancesTable.displayName = 'AssessmentInstancesTable';
