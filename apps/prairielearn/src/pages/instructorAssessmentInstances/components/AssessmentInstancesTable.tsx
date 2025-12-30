import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Column,
  type ColumnPinningState,
  type Header,
  type Row,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { type JSX, useCallback, useMemo, useRef, useState } from 'preact/compat';
import { Button } from 'react-bootstrap';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  NuqsAdapter,
  PresetFilterDropdown,
  TanstackTableCard,
  type TanstackTableCsvCell,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '@prairielearn/ui';

import { Scorebar } from '../../../components/Scorebar.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import {
  type AssessmentInstanceRow,
  AssessmentInstanceRowSchema,
} from '../instructorAssessmentInstances.types.js';

import { InstanceActionsCell } from './InstanceActionsCell.js';
import { TimeLimitPopover, type TimeLimitRowData } from './TimeLimitPopover.js';

const DEFAULT_SORT: SortingState = [{ id: 'assessment_instance_id', desc: false }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['assessment_instance_id'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;

const columnHelper = createColumnHelper<AssessmentInstanceRow>();

type FilterHeader = Header<AssessmentInstanceRow, unknown>;
type FilterColumn = Column<AssessmentInstanceRow, string>;

function RoleFilter({ header }: { header: FilterHeader }) {
  return (
    <CategoricalColumnFilter
      allColumnValues={ROLE_VALUES}
      column={header.column as FilterColumn}
      renderValueLabel={({ value }) => <span>{value}</span>}
    />
  );
}

interface AssessmentInstancesTableProps {
  csrfToken: string;
  urlPrefix: string;
  assessmentId: string;
  assessmentSetName: string;
  assessmentSetAbbr: string;
  assessmentNumber: string;
  assessmentGroupWork: boolean;
  assessmentMultipleInstance: boolean;
  hasCourseInstancePermissionEdit: boolean;
  timezone: string;
  initialData: AssessmentInstanceRow[];
}

function AssessmentInstancesTableInner({
  csrfToken,
  urlPrefix,
  assessmentId,
  assessmentSetName,
  assessmentSetAbbr,
  assessmentNumber,
  assessmentGroupWork,
  assessmentMultipleInstance,
  hasCourseInstancePermissionEdit,
  timezone,
  initialData,
}: AssessmentInstancesTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(false);

  // URL state
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );
  const [roleFilter, setRoleFilter] = useQueryState<(typeof ROLE_VALUES)[number][]>(
    'role',
    parseAsArrayOf(parseAsStringLiteral(ROLE_VALUES)).withDefault([]),
  );

  // Data fetching
  const { data: assessmentInstances } = useQuery<AssessmentInstanceRow[]>({
    queryKey: ['assessment-instances', urlPrefix, assessmentId],
    queryFn: async () => {
      const res = await fetch(`${urlPrefix}/assessment/${assessmentId}/instances/raw_data.json`);
      if (!res.ok) throw new Error('Failed to fetch assessment instances');
      const data = await res.json();
      const parsedData = z.array(AssessmentInstanceRowSchema).safeParse(data);
      if (!parsedData.success) throw new Error('Failed to parse assessment instances data');
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const invalidateQuery = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['assessment-instances', urlPrefix, assessmentId],
    });
  }, [queryClient, urlPrefix, assessmentId]);

  // Compute time limit totals for bulk actions
  const timeLimitTotals = useMemo<TimeLimitRowData>(() => {
    const timeLimitList: Record<number, string> = {};
    let remainingTimeMin = 0;
    let remainingTimeMax = 0;
    let hasOpenInstance = false;
    let hasClosedInstance = false;

    assessmentInstances.forEach((row) => {
      if (!row.open) {
        hasClosedInstance = true;
      } else if (row.time_remaining_sec === null) {
        hasOpenInstance = true;
      } else {
        if (row.total_time_sec === null) return;
        timeLimitList[row.total_time_sec] = row.total_time;
        if (remainingTimeMin === 0 || remainingTimeMin > row.time_remaining_sec) {
          remainingTimeMin = row.time_remaining_sec;
        }
        if (remainingTimeMax === 0 || remainingTimeMax < row.time_remaining_sec) {
          remainingTimeMax = row.time_remaining_sec;
        }
      }
    });

    let timeLimitValues = Object.values(timeLimitList);
    if (timeLimitValues.length > 5) {
      timeLimitValues = [
        ...timeLimitValues.slice(0, 3),
        '...',
        timeLimitValues[timeLimitValues.length - 1],
      ];
    }

    let timeRemaining = '';
    if (timeLimitValues.length === 0) {
      timeRemaining = 'No time limits';
    } else if (remainingTimeMax < 60) {
      timeRemaining = 'Less than a minute';
    } else if (remainingTimeMin < 60) {
      timeRemaining = 'up to ' + Math.floor(remainingTimeMax / 60) + ' min';
    } else if (Math.floor(remainingTimeMin / 60) === Math.floor(remainingTimeMax / 60)) {
      timeRemaining = Math.floor(remainingTimeMin / 60) + ' min';
    } else {
      timeRemaining =
        'between ' +
        Math.floor(remainingTimeMin / 60) +
        ' and ' +
        Math.floor(remainingTimeMax / 60) +
        ' min';
    }

    return {
      action: 'set_time_limit_all',
      total_time: timeLimitValues.length > 0 ? timeLimitValues.join(', ') : 'No time limits',
      total_time_sec: remainingTimeMax,
      time_remaining: timeRemaining,
      time_remaining_sec: remainingTimeMax,
      has_open_instance: hasOpenInstance,
      has_closed_instance: hasClosedInstance,
    };
  }, [assessmentInstances]);

  // Column definitions
  const columns = useMemo(() => {
    // Custom sort function for details link column
    const detailsSortFn = (rowA: Row<AssessmentInstanceRow>, rowB: Row<AssessmentInstanceRow>) => {
      const nameKey = assessmentGroupWork ? 'group_name' : 'uid';
      const idKey = assessmentGroupWork ? 'group_id' : 'user_id';

      const nameA = rowA.original[nameKey] ?? '';
      const nameB = rowB.original[nameKey] ?? '';
      const idA = rowA.original[idKey] ?? 0;
      const idB = rowB.original[idKey] ?? 0;

      let compare = String(nameA).localeCompare(String(nameB));
      if (!compare) compare = Number(idA) - Number(idB);
      if (!compare) compare = (rowA.original.number ?? 0) - (rowB.original.number ?? 0);
      if (!compare) {
        compare =
          Number(rowA.original.assessment_instance_id) -
          Number(rowB.original.assessment_instance_id);
      }
      return compare;
    };

    // Custom sort function for time remaining
    const timeRemainingSortFn = (
      rowA: Row<AssessmentInstanceRow>,
      rowB: Row<AssessmentInstanceRow>,
    ) => {
      // Closed assessments first, then by time ascending, then open without limit
      const openDiff = Number(rowA.original.open) - Number(rowB.original.open);
      if (openDiff !== 0) return openDiff;
      return (
        (rowA.original.time_remaining_sec ?? Infinity) -
        (rowB.original.time_remaining_sec ?? Infinity)
      );
    };

    return [
      // Details link column (pinned)
      columnHelper.accessor('assessment_instance_id', {
        id: 'assessment_instance_id',
        header: 'Assessment Instance',
        meta: { label: 'Assessment Instance' },
        minSize: 220,
        cell: (info) => {
          const row = info.row.original;
          const name = assessmentGroupWork ? row.group_name : row.uid;
          const number = !assessmentMultipleInstance && row.number === 1 ? '' : `#${row.number}`;
          return (
            <a href={`${urlPrefix}/assessment_instance/${info.getValue()}`}>
              {assessmentSetAbbr}
              {assessmentNumber}
              {number} for {name}
            </a>
          );
        },
        sortingFn: detailsSortFn,
        enableHiding: false,
      }),

      // Conditional columns for individual vs. group assessments
      ...(assessmentGroupWork
        ? [
            columnHelper.accessor('group_name', {
              id: 'group_name',
              header: 'Name',
              meta: { label: 'Name' },
            }),
            columnHelper.accessor('uid_list', {
              id: 'uid_list',
              header: 'Group Members',
              meta: { label: 'Group Members', wrapText: true },
              cell: (info) => {
                const list = info.getValue();
                if (!list?.[0]) return <small>(empty)</small>;
                return <small>{list.join(', ')}</small>;
              },
            }),
            columnHelper.accessor('user_name_list', {
              id: 'user_name_list',
              header: 'Group Member Name',
              meta: { label: 'Group Member Name', wrapText: true },
              cell: (info) => {
                const list = info.getValue();
                if (!list?.[0]) return <small>(empty)</small>;
                return <small>{list.join(', ')}</small>;
              },
            }),
            columnHelper.accessor('group_roles', {
              id: 'group_roles',
              header: () => (
                <span>
                  Roles{' '}
                  <button
                    aria-label="Roles help"
                    class="btn btn-xs btn-ghost"
                    data-bs-target="#role-help"
                    data-bs-toggle="modal"
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i aria-hidden="true" class="bi-question-circle-fill" />
                  </button>
                </span>
              ),
              meta: { label: 'Roles', wrapText: true },
              cell: (info) => {
                const list = info.getValue();
                if (!list?.[0]) return <small>(empty)</small>;
                const unique = Array.from(new Set(list));
                return <small>{unique.join(', ')}</small>;
              },
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                const roles = row.original.group_roles ?? [];
                return filterValues.some((v) => roles.includes(v));
              },
            }),
          ]
        : [
            columnHelper.accessor('uid', {
              id: 'uid',
              header: 'UID',
              meta: { label: 'UID' },
            }),
            columnHelper.accessor('name', {
              id: 'name',
              header: 'Name',
              meta: { label: 'Name' },
            }),
            columnHelper.accessor('role', {
              id: 'role',
              header: () => (
                <span>
                  Role{' '}
                  <button
                    aria-label="Roles help"
                    class="btn btn-xs btn-ghost"
                    data-bs-target="#role-help"
                    data-bs-toggle="modal"
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i aria-hidden="true" class="bi-question-circle-fill" />
                  </button>
                </span>
              ),
              meta: { label: 'Role' },
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                return filterValues.includes(row.original.role);
              },
            }),
          ]),

      // Instance number
      columnHelper.accessor('number', {
        id: 'number',
        header: 'Instance',
        meta: { label: 'Instance' },
      }),

      // Score
      columnHelper.accessor('score_perc', {
        id: 'score_perc',
        header: 'Score',
        meta: { label: 'Score' },
        cell: (info) => (
          <div class="d-flex align-items-center h-100">
            <Scorebar score={info.getValue()} />
          </div>
        ),
      }),

      // Date started
      columnHelper.accessor('date_formatted', {
        id: 'date_formatted',
        header: 'Date started',
        meta: { label: 'Date started' },
        minSize: 230,
        sortingFn: (rowA, rowB) => {
          const dateA = rowA.original.date;
          const dateB = rowB.original.date;
          if (!dateA || !dateB) return 0;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        },
      }),

      // Duration
      columnHelper.accessor('duration', {
        id: 'duration',
        header: () => (
          <span>
            Duration{' '}
            <button
              aria-label="Duration help"
              class="btn btn-xs btn-ghost"
              data-bs-target="#duration-help"
              data-bs-toggle="modal"
              type="button"
              onClick={(e) => e.stopPropagation()}
            >
              <i aria-hidden="true" class="bi-question-circle-fill" />
            </button>
          </span>
        ),
        meta: { label: 'Duration' },
        minSize: 100,
        sortingFn: (rowA, rowB) => {
          return rowA.original.duration_secs - rowB.original.duration_secs;
        },
      }),

      // Time remaining
      columnHelper.accessor('time_remaining', {
        id: 'time_remaining',
        header: () => (
          <span>
            Remaining{' '}
            <button
              aria-label="Remaining time help"
              class="btn btn-xs btn-ghost"
              data-bs-target="#time-remaining-help"
              data-bs-toggle="modal"
              type="button"
              onClick={(e) => e.stopPropagation()}
            >
              <i aria-hidden="true" class="bi-question-circle-fill" />
            </button>
          </span>
        ),
        meta: { label: 'Remaining' },
        minSize: 200,
        sortingFn: timeRemainingSortFn,
        cell: (info) => {
          const row = info.row.original;
          return (
            <span class="d-flex flex-row align-items-center text-nowrap">
              {hasCourseInstancePermissionEdit && (
                <TimeLimitPopover
                  csrfToken={csrfToken}
                  placement="bottom"
                  row={{
                    assessment_instance_id: row.assessment_instance_id,
                    date: row.date?.toISOString(),
                    total_time: row.total_time,
                    total_time_sec: row.total_time_sec,
                    time_remaining: row.time_remaining,
                    time_remaining_sec: row.time_remaining_sec,
                    open: row.open,
                  }}
                  timezone={timezone}
                  onSuccess={invalidateQuery}
                >
                  <button
                    aria-label="Change time limit"
                    class="btn btn-secondary btn-xs me-1"
                    type="button"
                  >
                    <i aria-hidden="true" class="bi-pencil-square" />
                  </button>
                </TimeLimitPopover>
              )}
              {info.getValue()}
            </span>
          );
        },
      }),

      // Total time limit
      columnHelper.accessor('total_time', {
        id: 'total_time',
        header: 'Total Time Limit',
        meta: { label: 'Total Time Limit' },
        sortingFn: (rowA, rowB) => {
          return (rowA.original.total_time_sec ?? 0) - (rowB.original.total_time_sec ?? 0);
        },
      }),

      // Fingerprint changes
      columnHelper.accessor('client_fingerprint_id_change_count', {
        id: 'client_fingerprint_id_change_count',
        header: () => (
          <span>
            Fingerprint Changes{' '}
            <button
              aria-label="Fingerprint changes help"
              class="btn btn-xs btn-ghost"
              data-bs-target="#fingerprint-changes-help"
              data-bs-toggle="modal"
              type="button"
              onClick={(e) => e.stopPropagation()}
            >
              <i aria-hidden="true" class="bi-question-circle-fill" />
            </button>
          </span>
        ),
        meta: { label: 'Fingerprint Changes' },
        minSize: 230,
      }),

      // Actions
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <InstanceActionsCell
            assessmentGroupWork={assessmentGroupWork}
            csrfToken={csrfToken}
            hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
            row={info.row.original}
            timezone={timezone}
            onActionComplete={invalidateQuery}
          />
        ),
        enableHiding: false,
        enableSorting: false,
      }),
    ];
  }, [
    assessmentGroupWork,
    assessmentMultipleInstance,
    assessmentSetAbbr,
    assessmentNumber,
    urlPrefix,
    csrfToken,
    timezone,
    hasCourseInstancePermissionEdit,
    invalidateQuery,
  ]);

  // Column IDs for visibility management
  const allColumnIds = useMemo(() => {
    return columns.map((col) => col.id).filter((id): id is string => id !== undefined);
  }, [columns]);

  // Default visibility: hide UID, number, total_time by default for individual
  // hide group_name, user_name_list, total_time by default for group
  const defaultColumnVisibility = useMemo(() => {
    const hidden = assessmentGroupWork
      ? ['group_name', 'user_name_list', 'number', 'total_time']
      : ['uid', 'number', 'total_time'];
    // Also hide fingerprint changes for group work by default
    if (assessmentGroupWork) {
      hidden.push('client_fingerprint_id_change_count');
    }
    return Object.fromEntries(allColumnIds.map((id) => [id, !hidden.includes(id)]));
  }, [allColumnIds, assessmentGroupWork]);

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  // Column filters state
  const columnFilters = useMemo(() => {
    if (roleFilter.length === 0) return [];
    return [{ id: assessmentGroupWork ? 'group_roles' : 'role', value: roleFilter }];
  }, [roleFilter, assessmentGroupWork]);

  // Custom global filter function
  const globalFilterFn = (
    row: Row<AssessmentInstanceRow>,
    columnId: string,
    filterValue: string,
  ) => {
    const search = filterValue.toLowerCase();
    if (!search) return true;

    if (assessmentGroupWork) {
      return (
        row.original.group_name?.toLowerCase().includes(search) ||
        row.original.uid_list?.some((uid) => uid.toLowerCase().includes(search)) ||
        row.original.user_name_list?.some((name) => name?.toLowerCase().includes(search)) ||
        row.original.group_roles?.some((role) => role.toLowerCase().includes(search)) ||
        false
      );
    } else {
      return (
        row.original.uid?.toLowerCase().includes(search) ||
        row.original.name?.toLowerCase().includes(search) ||
        row.original.role.toLowerCase().includes(search) ||
        false
      );
    }
  };

  const table = useReactTable({
    data: assessmentInstances,
    columns,
    getRowId: (row) => row.assessment_instance_id,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      columnPinning,
      columnFilters,
    },
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    globalFilterFn,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      size: 150,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  // Filters for header cells
  const filters: Record<string, (props: { header: FilterHeader }) => JSX.Element> = useMemo(() => {
    const columnId = assessmentGroupWork ? 'group_roles' : 'role';
    return { [columnId]: RoleFilter };
  }, [assessmentGroupWork]);

  return (
    <TanstackTableCard
      table={table}
      title={`${assessmentSetName} ${assessmentNumber}: Students`}
      singularLabel="instance"
      pluralLabel="instances"
      // eslint-disable-next-line @eslint-react/no-forbidden-props
      className="h-100"
      headerButtons={
        hasCourseInstancePermissionEdit ? (
          <div class="dropdown">
            <button
              aria-expanded="false"
              aria-haspopup="true"
              class="btn btn-light btn-sm dropdown-toggle"
              data-bs-toggle="dropdown"
              type="button"
            >
              Action for all instances
            </button>
            <div class="dropdown-menu dropdown-menu-end">
              <button
                class="dropdown-item"
                data-bs-target="#deleteAllAssessmentInstancesModal"
                data-bs-toggle="modal"
                type="button"
              >
                <i aria-hidden="true" class="fas fa-times me-2" />
                Delete all instances
              </button>
              <button
                class="dropdown-item"
                data-bs-target="#grade-all-form"
                data-bs-toggle="modal"
                type="button"
              >
                <i aria-hidden="true" class="fas fa-clipboard-check me-2" />
                Grade all instances
              </button>
              <button
                class="dropdown-item"
                data-bs-target="#closeAllAssessmentInstancesModal"
                data-bs-toggle="modal"
                type="button"
              >
                <i aria-hidden="true" class="fas fa-ban me-2" />
                Grade and close all instances
              </button>
              <TimeLimitPopover
                csrfToken={csrfToken}
                placement="left"
                row={timeLimitTotals}
                timezone={timezone}
                onSuccess={invalidateQuery}
              >
                <button class="dropdown-item" type="button">
                  <i aria-hidden="true" class="far fa-clock me-2" />
                  Change time limit for all instances
                </button>
              </TimeLimitPopover>
            </div>
          </div>
        ) : undefined
      }
      downloadButtonOptions={{
        filenameBase: `assessment_instances_${assessmentSetAbbr}${assessmentNumber}`,
        mapRowToData: (row: AssessmentInstanceRow) => {
          const data: TanstackTableCsvCell[] = assessmentGroupWork
            ? [
                { name: 'Group Name', value: row.group_name },
                { name: 'Group Members', value: row.uid_list?.join(', ') ?? null },
                {
                  name: 'Roles',
                  value: row.group_roles ? [...new Set(row.group_roles)].join(', ') : null,
                },
              ]
            : [
                { name: 'UID', value: row.uid },
                { name: 'Name', value: row.name },
                { name: 'Role', value: row.role },
              ];
          data.push(
            { name: 'Instance', value: row.number },
            { name: 'Score', value: row.score_perc },
            { name: 'Date Started', value: row.date_formatted },
            { name: 'Duration', value: row.duration },
            { name: 'Time Remaining', value: row.time_remaining },
            { name: 'Total Time Limit', value: row.total_time },
            { name: 'Fingerprint Changes', value: row.client_fingerprint_id_change_count },
          );
          return data;
        },
        pluralLabel: 'assessment instances',
        singularLabel: 'assessment instance',
        hasSelection: false,
      }}
      columnManager={{
        buttons: (
          <>
            <PresetFilterDropdown
              label="Filter"
              options={{
                'All instances': [],
                'Students only': [
                  { id: assessmentGroupWork ? 'group_roles' : 'role', value: ['Student'] },
                ],
              }}
              table={table}
              onSelect={(optionName) => {
                if (optionName === 'Students only') {
                  void setRoleFilter(['Student']);
                } else {
                  void setRoleFilter([]);
                }
              }}
            />
            <Button
              size="sm"
              title={autoRefresh ? 'Auto-refresh is on (30s)' : 'Enable auto-refresh'}
              variant={autoRefresh ? 'primary' : 'outline-secondary'}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <i aria-hidden="true" class="fa fa-clock me-1" />
              Auto Refresh
            </Button>
          </>
        ),
      }}
      globalFilter={{
        placeholder: assessmentGroupWork
          ? 'Search by group name, members...'
          : 'Search by UID, name...',
      }}
      tableOptions={{
        filters,
        scrollRef: tableRef,
      }}
    />
  );
}

interface AssessmentInstancesTableWrapperProps extends AssessmentInstancesTableProps {
  search: string;
  isDevMode: boolean;
}

export function AssessmentInstancesTable({
  search,
  isDevMode,
  ...props
}: AssessmentInstancesTableWrapperProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <AssessmentInstancesTableInner {...props} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentInstancesTable.displayName = 'AssessmentInstancesTable';
