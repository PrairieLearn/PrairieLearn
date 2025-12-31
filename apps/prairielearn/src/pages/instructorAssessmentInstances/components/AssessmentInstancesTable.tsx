import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Column,
  type ColumnPinningState,
  type ColumnSizingState,
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
import { Button, Dropdown, Modal } from 'react-bootstrap';
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
import { TimeLimitEditForm, TimeLimitPopover, type TimeLimitRowData } from './TimeLimitEditForm.js';

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

type HelpModalType = 'role' | 'duration' | 'time-remaining' | 'fingerprint' | null;
type ActionModalType = 'delete-all' | 'grade-all' | 'close-all' | 'time-limit-all' | null;

function HelpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      class="btn btn-xs btn-ghost"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <i aria-hidden="true" class="bi-question-circle-fill" />
    </button>
  );
}

function RoleHelpModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Roles</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ul>
          <li>
            <strong>Staff</strong> is a member of the course staff. They can see the data of all
            users, and depending on course settings may have permission to edit the information of
            other users.
          </li>
          <li>
            <strong>Student</strong> is a student participating in the class. They can only see
            their own information, and can do assessments.
          </li>
          <li>
            <strong>None</strong> is a user who at one point added the course and later removed
            themselves. They can no longer access the course but their work done within the course
            has been retained.
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function DurationHelpModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Duration</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          The "Duration" is the amount of time that a student has spent actively working on the
          assessment. The duration time measurement begins when the student starts the assessment
          and continues until the most recent answer submission.
        </p>
        <p>
          <strong>For Homework assessments</strong>, a student is considered to be actively working
          if they have at least one answer submission per hour, so the duration measurement is
          paused if there is a gap of more than one hour between answer submissions. For example:
        </p>
        <ul>
          <li>08:00 - student starts assessment;</li>
          <li>08:30 - student submits answer;</li>
          <li>09:00 - student submits answer;</li>
          <li>(gap of more than one hour)</li>
          <li>11:00 - student submits answer;</li>
          <li>11:30 - student submits answer;</li>
          <li>12:00 - student submits answer.</li>
        </ul>
        <p>
          In the above example, the "duration" would be 2 hours: one hour from 08:00 to 09:00, and
          another hour from 11:00 to 12:00. The two-hour gap between 09:00 to 11:00 is not counted
          as part of the duration.
        </p>
        <p>
          <strong>For Exam assessments</strong>, a student is considered to be actively working
          between the start of the assessment and the last submission, regardless of any potential
          inactivity. For the same example above, the "duration" would be 4 hours, from 08:00 to
          12:00. The two-hour gap is not considered inactivity, since it is assumed that this kind
          of assessment requires students to be active for the duration of the assessment.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function TimeRemainingHelpModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Time remaining</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          For open assessments with a time limit, this column will indicate the number of minutes
          (rounded down) the student has left to complete the assessment. If the value is{' '}
          <strong>&lt; 1 min</strong>, the student has less than one minute to complete it. This
          column may also contain one of the following special values.
        </p>
        <ul>
          <li>
            <strong>Expired</strong> indicates the assessment time limit has expired, and will be
            automatically closed as soon as possible. If an assessment is Expired for a prolonged
            period of time, this typically means the student has closed their browser or lost
            connectivity, and the assessment will be closed as soon as the student opens the
            assessment. No further submissions are accepted at this point.
          </li>
          <li>
            <strong>Closed</strong> indicates the assessment has been closed, and no further
            submissions are accepted.
          </li>
          <li>
            <strong>Open (no time limit)</strong> indicates that the assessment is still open and
            accepting submissions, and there is no time limit to submit the assessment (other than
            those indicated by access rules).
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function FingerprintChangesHelpModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Client fingerprints</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Client fingerprints are a record of a user's IP address, user agent and session. These
          attributes are tracked while a user is accessing an assessment. This value indicates the
          amount of times that those attributes changed as the student accessed the assessment,
          while the assessment was active. Some changes may naturally occur during an assessment,
          such as if a student changes network connections or browsers. However, a high number of
          changes in an exam-like environment could be an indication of multiple people accessing
          the same assessment simultaneously, which may suggest an academic integrity issue.
          Accesses taking place after the assessment has been closed are not counted, as they
          typically indicate scenarios where a student is reviewing their results, which may happen
          outside of a controlled environment.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

interface ActionModalProps {
  show: boolean;
  onHide: () => void;
  assessmentSetName: string;
  assessmentNumber: string;
  csrfToken: string;
  onSuccess: () => void;
}

function DeleteAllModal({
  show,
  onHide,
  assessmentSetName,
  assessmentNumber,
  csrfToken,
  onSuccess,
}: ActionModalProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new URLSearchParams({
        __action: 'delete_all',
        __csrf_token: csrfToken,
      });
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Failed to delete all instances');
    },
    onSuccess: () => {
      onSuccess();
      onHide();
    },
  });

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Delete all assessment instances</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Are you sure you want to delete all assessment instances for{' '}
        <strong>
          {assessmentSetName} {assessmentNumber}
        </strong>
        ? This cannot be undone.
        {mutation.isError && (
          <div class="alert alert-danger mt-3" role="alert">
            {mutation.error.message}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Deleting...' : 'Delete all'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function GradeAllModal({
  show,
  onHide,
  assessmentSetName,
  assessmentNumber,
  csrfToken,
  onSuccess,
}: ActionModalProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new URLSearchParams({
        __action: 'grade_all',
        __csrf_token: csrfToken,
      });
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Failed to grade all instances');
    },
    onSuccess: () => {
      onSuccess();
      onHide();
    },
  });

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Grade all assessment instances</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Are you sure you want to grade pending submissions for all assessment instances for{' '}
        <strong>
          {assessmentSetName} {assessmentNumber}
        </strong>
        ? This cannot be undone.
        {mutation.isError && (
          <div class="alert alert-danger mt-3" role="alert">
            {mutation.error.message}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Grading...' : 'Grade all'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function CloseAllModal({
  show,
  onHide,
  assessmentSetName,
  assessmentNumber,
  csrfToken,
  onSuccess,
}: ActionModalProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new URLSearchParams({
        __action: 'close_all',
        __csrf_token: csrfToken,
      });
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Failed to close all instances');
    },
    onSuccess: () => {
      onSuccess();
      onHide();
    },
  });

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Grade and close all assessment instances</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Are you sure you want to grade and close all assessment instances for{' '}
        <strong>
          {assessmentSetName} {assessmentNumber}
        </strong>
        ? This cannot be undone.
        {mutation.isError && (
          <div class="alert alert-danger mt-3" role="alert">
            {mutation.error.message}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Processing...' : 'Grade and close all'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

interface TimeLimitAllModalProps {
  show: boolean;
  onHide: () => void;
  row: TimeLimitRowData;
  csrfToken: string;
  timezone: string;
  onSuccess: () => void;
}

function TimeLimitAllModal({
  show,
  onHide,
  row,
  csrfToken,
  timezone,
  onSuccess,
}: TimeLimitAllModalProps) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Change time limits</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <TimeLimitEditForm
          csrfToken={csrfToken}
          row={row}
          timezone={timezone}
          onCancel={onHide}
          onSuccess={onSuccess}
        />
      </Modal.Body>
    </Modal>
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

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  // Modal state
  const [helpModal, setHelpModal] = useState<HelpModalType>(null);
  const [actionModal, setActionModal] = useState<ActionModalType>(null);

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
        header: 'Assessment instance',
        meta: { label: 'Assessment instance' },
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
                  Roles <HelpButton label="Roles help" onClick={() => setHelpModal('role')} />
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
                  Role <HelpButton label="Roles help" onClick={() => setHelpModal('role')} />
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
            Duration <HelpButton label="Duration help" onClick={() => setHelpModal('duration')} />
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
            <HelpButton
              label="Remaining time help"
              onClick={() => setHelpModal('time-remaining')}
            />
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
        header: 'Total time limit',
        meta: { label: 'Total time limit' },
        sortingFn: (rowA, rowB) => {
          return (rowA.original.total_time_sec ?? 0) - (rowB.original.total_time_sec ?? 0);
        },
      }),

      // Fingerprint changes
      columnHelper.accessor('client_fingerprint_id_change_count', {
        id: 'client_fingerprint_id_change_count',
        header: () => (
          <span>
            Fingerprint changes{' '}
            <HelpButton
              label="Fingerprint changes help"
              onClick={() => setHelpModal('fingerprint')}
            />
          </span>
        ),
        meta: { label: 'Fingerprint changes' },
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
    setHelpModal,
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
    columnResizeMode: 'onChange',
    getRowId: (row) => row.assessment_instance_id,
    state: {
      sorting,
      globalFilter,
      columnSizing,
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
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      size: 150,
      maxSize: 500,
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
    <>
      <TanstackTableCard
        table={table}
        title={`${assessmentSetName} ${assessmentNumber}: Students`}
        singularLabel="instance"
        pluralLabel="instances"
        // eslint-disable-next-line @eslint-react/no-forbidden-props
        className="h-100"
        headerButtons={
          hasCourseInstancePermissionEdit ? (
            <Dropdown>
              <Dropdown.Toggle variant="light" size="sm">
                Action for all instances
              </Dropdown.Toggle>
              <Dropdown.Menu align="end">
                <Dropdown.Item as="button" onClick={() => setActionModal('delete-all')}>
                  <i aria-hidden="true" class="fas fa-times me-2" />
                  Delete all instances
                </Dropdown.Item>
                <Dropdown.Item as="button" onClick={() => setActionModal('grade-all')}>
                  <i aria-hidden="true" class="fas fa-clipboard-check me-2" />
                  Grade all instances
                </Dropdown.Item>
                <Dropdown.Item as="button" onClick={() => setActionModal('close-all')}>
                  <i aria-hidden="true" class="fas fa-ban me-2" />
                  Grade and close all instances
                </Dropdown.Item>
                <Dropdown.Item as="button" onClick={() => setActionModal('time-limit-all')}>
                  <i aria-hidden="true" class="far fa-clock me-2" />
                  Change time limit for all instances
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
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

      {/* Help Modals */}
      <RoleHelpModal show={helpModal === 'role'} onHide={() => setHelpModal(null)} />
      <DurationHelpModal show={helpModal === 'duration'} onHide={() => setHelpModal(null)} />
      <TimeRemainingHelpModal
        show={helpModal === 'time-remaining'}
        onHide={() => setHelpModal(null)}
      />
      <FingerprintChangesHelpModal
        show={helpModal === 'fingerprint'}
        onHide={() => setHelpModal(null)}
      />

      {/* Action Modals */}
      <DeleteAllModal
        show={actionModal === 'delete-all'}
        assessmentSetName={assessmentSetName}
        assessmentNumber={assessmentNumber}
        csrfToken={csrfToken}
        onHide={() => setActionModal(null)}
        onSuccess={invalidateQuery}
      />
      <GradeAllModal
        show={actionModal === 'grade-all'}
        assessmentSetName={assessmentSetName}
        assessmentNumber={assessmentNumber}
        csrfToken={csrfToken}
        onHide={() => setActionModal(null)}
        onSuccess={invalidateQuery}
      />
      <CloseAllModal
        show={actionModal === 'close-all'}
        assessmentSetName={assessmentSetName}
        assessmentNumber={assessmentNumber}
        csrfToken={csrfToken}
        onHide={() => setActionModal(null)}
        onSuccess={invalidateQuery}
      />
      <TimeLimitAllModal
        show={actionModal === 'time-limit-all'}
        row={timeLimitTotals}
        csrfToken={csrfToken}
        timezone={timezone}
        onHide={() => setActionModal(null)}
        onSuccess={invalidateQuery}
      />
    </>
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
