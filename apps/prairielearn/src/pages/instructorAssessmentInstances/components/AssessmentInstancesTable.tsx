import { useQuery } from '@tanstack/react-query';
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
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';

import {
  type ColumnFilter,
  type ColumnFilterEntry,
  IndeterminateCheckbox,
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  type NumericColumnFilterValue,
  NumericInputColumnFilter,
  PresetFilterDropdown,
  TanstackTableCard,
  type TanstackTableCsvCell,
  TanstackTableEmptyState,
  applyMultiSelectFilter,
  extractLeafColumnIds,
  numericColumnFilterFn,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsNumericFilter,
  parseAsSortingState,
  parseNumericFilter,
  useColumnFilters,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { Scorebar } from '../../../components/Scorebar.js';
import type {
  StaffAssessment,
  StaffAssessmentSet,
  StaffCourseInstance,
} from '../../../lib/client/safe-db-types.js';
import { getAssessmentInstanceUrl, getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { type HelpModalId, HelpModals } from './HelpModals.js';
import { InstanceSelectionToolbar } from './InstanceSelectionToolbar.js';
import { TimeLimitEditForm } from './TimeLimitEditForm.js';

const columnHelper = createColumnHelper<AssessmentInstanceRow>();
const DEFAULT_SORT: SortingState = [];

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
type RoleValue = (typeof ROLE_VALUES)[number];
const STUDENTS_ONLY_FILTER: MultiSelectFilterValue<RoleValue> = {
  values: ['Student'],
  mode: 'include',
};
const ALL_ROLES_FILTER: MultiSelectFilterValue<RoleValue> = { values: [], mode: 'include' };

const EMPTY_NUMERIC_FILTER: NumericColumnFilterValue = { filterValue: '', emptyOnly: false };

// Numeric columns that support comparison-operator filtering (e.g. `>0`, `<=5`).
const NUMERIC_COLUMN_IDS = [
  'number',
  'score_perc',
  'duration',
  'time_remaining',
  'total_time',
  'client_fingerprint_id_change_count',
] as const;

// Time columns whose filter values are entered in minutes. Their raw cell values
// are in other units (duration in milliseconds, the rest in seconds), so the
// filter functions convert before comparing.
const MINUTES_COLUMN_IDS = new Set<string>(['duration', 'time_remaining', 'total_time']);

const MS_PER_MINUTE = 60_000;
const SECONDS_PER_MINUTE = 60;

/**
 * Builds a numeric filter function that compares the cell value in minutes,
 * dividing the raw value by `rawUnitsPerMinute` (e.g. 60000 for milliseconds,
 * 60 for seconds) before applying the operator.
 */
function makeMinutesFilterFn(rawUnitsPerMinute: number): FilterFn<AssessmentInstanceRow> {
  return (row, columnId, value: NumericColumnFilterValue) => {
    const raw = row.getValue<number | null>(columnId);
    if (value.emptyOnly) return raw == null;
    const parsed = parseNumericFilter(value.filterValue);
    if (!parsed) return true;
    if (raw == null) return false;
    const minutes = raw / rawUnitsPerMinute;
    switch (parsed.operator) {
      case '<':
        return minutes < parsed.value;
      case '>':
        return minutes > parsed.value;
      case '<=':
        return minutes <= parsed.value;
      case '>=':
        return minutes >= parsed.value;
      case '=':
        return minutes === parsed.value;
      default:
        return true;
    }
  };
}

const durationMinutesFilterFn = makeMinutesFilterFn(MS_PER_MINUTE);
const secondsMinutesFilterFn = makeMinutesFilterFn(SECONDS_PER_MINUTE);

const AUTO_SIZE_SAMPLE_COUNT = 10;

/**
 * Returns the indices of the rows with the widest content (by the given measure),
 * so `useAutoSizeColumns` measures the cells most likely to need the most space.
 */
function autoSizeSampleByMeasure(
  rows: AssessmentInstanceRow[],
  measure: (row: AssessmentInstanceRow) => number,
): number[] {
  return rows
    .map((row, index) => ({ measure: measure(row), index }))
    .sort((a, b) => b.measure - a.measure)
    .slice(0, AUTO_SIZE_SAMPLE_COUNT)
    .map(({ index }) => index);
}

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

export function AssessmentInstancesTable({
  initialRows,
  assessment,
  assessmentSet,
  courseInstance,
  canEdit,
  isDevMode,
}: {
  initialRows: AssessmentInstanceRow[];
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  courseInstance: StaffCourseInstance;
  canEdit: boolean;
  isDevMode: boolean;
}) {
  const trpc = useTRPC();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );

  // The role column to filter on differs between individual and group assessments.
  const roleColumnId = assessment.team_work ? 'group_roles' : 'role';
  const filterRegistry = useMemo(() => {
    const registry: Record<
      string,
      | ColumnFilterEntry<MultiSelectFilterValue<RoleValue>>
      | ColumnFilterEntry<NumericColumnFilterValue>
    > = {
      [roleColumnId]: {
        urlKey: 'role',
        parser: parseAsMultiSelectFilter(ROLE_VALUES),
        defaultValue: STUDENTS_ONLY_FILTER,
      },
    };
    for (const id of NUMERIC_COLUMN_IDS) {
      registry[id] = {
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
      };
    }
    return registry;
  }, [roleColumnId]);
  const { columnFilters, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [helpModal, setHelpModal] = useState<HelpModalId | null>(null);
  const [timeLimitRow, setTimeLimitRow] = useState<AssessmentInstanceRow | null>(null);
  const { createCheckboxProps } = useShiftClickCheckbox<AssessmentInstanceRow>();

  const { data = initialRows } = useQuery({
    ...trpc.assessmentInstances.list.queryOptions(),
    staleTime: Infinity,
    initialData: initialRows,
  });

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
          const name = assessment.team_work ? row.group?.name : row.user?.uid;
          let number = '';
          if (!assessment.multiple_instance) {
            number =
              row.assessment_instance.number === 1 ? '' : `#${row.assessment_instance.number}`;
          }
          return (
            <a
              className="text-nowrap"
              href={getAssessmentInstanceUrl({
                courseInstanceId: courseInstance.id,
                assessmentInstanceId: row.assessment_instance.id,
              })}
            >
              {assessmentSet.abbreviation}
              {assessment.number}
              {number} for {name}
            </a>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          const nameA = (assessment.team_work ? a.group?.name : a.user?.uid) ?? '';
          const nameB = (assessment.team_work ? b.group?.name : b.user?.uid) ?? '';
          const idA = (assessment.team_work ? a.group?.id : a.user?.id) ?? '';
          const idB = (assessment.team_work ? b.group?.id : b.user?.id) ?? '';
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

    if (assessment.team_work) {
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
          filterFn: (row, _columnId, filter: MultiSelectFilterValue<RoleValue>) =>
            applyMultiSelectFilter(filter, (values) =>
              values.some((value) => row.original.group_roles?.includes(value) ?? false),
            ),
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
          cell: (info) => {
            const name = info.getValue();
            const enrollmentId = info.row.original.enrollment_id;
            if (name == null) return null;
            if (enrollmentId == null) return name;
            return <a href={getStudentEnrollmentUrl(courseInstance.id, enrollmentId)}>{name}</a>;
          },
          size: 200,
        }),
        columnHelper.accessor((row) => row.role, {
          id: 'role',
          header: () => <HelpHeader label="Role" modalId="roles" onShowHelp={setHelpModal} />,
          cell: (info) => info.getValue(),
          meta: { label: 'Role' },
          filterFn: (row, columnId, filter: MultiSelectFilterValue<RoleValue>) =>
            applyMultiSelectFilter(filter, (values) =>
              values.includes(row.getValue<RoleValue>(columnId)),
            ),
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
        filterFn: numericColumnFilterFn,
        size: 100,
      }),
      columnHelper.accessor((row) => row.assessment_instance.score_perc, {
        id: 'score_perc',
        header: 'Score',
        cell: (info) => <Scorebar score={info.getValue()} />,
        meta: { label: 'Score' },
        filterFn: numericColumnFilterFn,
        size: 150,
      }),
      columnHelper.accessor((row) => row.assessment_instance.date, {
        id: 'date',
        header: 'Date started',
        cell: (info) => {
          const date = info.getValue();
          if (!date) return null;
          return (
            <span className="text-nowrap">
              <FriendlyDate date={date} timezone={courseInstance.display_timezone} tooltip />
            </span>
          );
        },
        sortingFn: 'datetime',
        meta: {
          label: 'Date started',
          autoSize: true,
          autoSizeSample: (rows) => autoSizeSampleByMeasure(rows, (r) => r.date_formatted.length),
        },
        minSize: 120,
        maxSize: 300,
      }),
      columnHelper.accessor((row) => row.assessment_instance.duration, {
        id: 'duration',
        header: () => <HelpHeader label="Duration" modalId="duration" onShowHelp={setHelpModal} />,
        cell: (info) => <span className="text-nowrap">{info.row.original.duration_formatted}</span>,
        meta: { label: 'Duration' },
        filterFn: durationMinutesFilterFn,
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
                  className="btn btn-xs btn-ghost text-muted ms-1"
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
        meta: {
          label: 'Remaining',
          autoSize: true,
          autoSizeSample: (rows) => autoSizeSampleByMeasure(rows, (r) => r.time_remaining.length),
        },
        filterFn: secondsMinutesFilterFn,
        minSize: 120,
        maxSize: 300,
      }),
      columnHelper.accessor((row) => row.total_time_sec, {
        id: 'total_time',
        header: 'Total time limit',
        cell: (info) => <span className="text-nowrap">{info.row.original.total_time}</span>,
        meta: { label: 'Total time limit' },
        filterFn: secondsMinutesFilterFn,
        size: 150,
      }),
      columnHelper.accessor((row) => row.assessment_instance.client_fingerprint_id_change_count, {
        id: 'client_fingerprint_id_change_count',
        header: () => (
          <HelpHeader label="Fingerprint changes" modalId="fingerprint" onShowHelp={setHelpModal} />
        ),
        cell: (info) => info.getValue(),
        meta: { label: 'Fingerprint changes' },
        filterFn: numericColumnFilterFn,
        size: 150,
      }),
    );

    return cols;
  }, [
    canEdit,
    assessment.team_work,
    assessment.multiple_instance,
    assessment.number,
    assessmentSet.abbreviation,
    courseInstance.id,
    courseInstance.display_timezone,
    createCheckboxProps,
  ]);

  const allColumnIds = useMemo(() => extractLeafColumnIds(columns), [columns]);

  const defaultColumnVisibility = useMemo(() => {
    // The role column is hidden by default since the "Students only" filter is
    // active by default, making the column redundant.
    const hidden = new Set([
      'uid',
      'number',
      'total_time',
      'group_name',
      'user_name_list',
      roleColumnId,
    ]);
    if (assessment.team_work) hidden.add('client_fingerprint_id_change_count');
    const visibility: Record<string, boolean> = {};
    for (const id of allColumnIds) visibility[id] = !hidden.has(id);
    return visibility;
  }, [allColumnIds, assessment.team_work, roleColumnId]);

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

  const filters = useMemo(() => {
    const map: Record<string, ColumnFilter<AssessmentInstanceRow>> = {
      [roleColumnId]: ({ header }) => (
        <MultiSelectColumnFilter column={header.column} allColumnValues={ROLE_VALUES} />
      ),
    };
    for (const id of NUMERIC_COLUMN_IDS) {
      const unit = MINUTES_COLUMN_IDS.has(id) ? 'minutes' : undefined;
      map[id] = ({ header }) => <NumericInputColumnFilter column={header.column} unit={unit} />;
    }
    return map;
  }, [roleColumnId]);

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
      columnFilters,
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
    onColumnFiltersChange,
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

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);

  const selectionToolbar = canEdit ? (
    <InstanceSelectionToolbar
      selectedRows={selectedRows}
      allRows={data}
      clearSelection={() => setRowSelection({})}
      courseInstanceId={courseInstance.id}
      assessmentId={assessment.id}
      timezone={courseInstance.display_timezone}
      groupWork={assessment.team_work}
      isDevMode={isDevMode}
      onActionSuccess={setSuccessMessage}
    />
  ) : null;

  return (
    <>
      {successMessage && (
        <Alert
          variant="success"
          className="mb-3"
          dismissible
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Students"
        className="h-100"
        singularLabel="instance"
        pluralLabel="instances"
        headerButtons={selectionToolbar}
        columnManager={{
          buttons: (
            <PresetFilterDropdown
              table={table}
              label="Filter"
              options={{
                'Students only': [{ id: roleColumnId, value: STUDENTS_ONLY_FILTER }],
                All: [{ id: roleColumnId, value: ALL_ROLES_FILTER }],
              }}
              onSelect={(optionName) =>
                void setColumnVisibility((prev) => ({
                  ...prev,
                  [roleColumnId]: optionName === 'All',
                }))
              }
            />
          ),
        }}
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
          placeholder: assessment.team_work
            ? 'Search by group, member, role...'
            : 'Search by UID, name...',
        }}
        tableOptions={{
          filters,
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
        onResetColumnFilters={onResetColumnFilters}
      />

      <HelpModals show={helpModal} onHide={() => setHelpModal(null)} />

      {timeLimitRow ? (
        <TimeLimitModal
          row={timeLimitRow}
          timezone={courseInstance.display_timezone}
          onHide={() => setTimeLimitRow(null)}
          onSuccess={() => {
            setSuccessMessage('Updated the time limit.');
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
