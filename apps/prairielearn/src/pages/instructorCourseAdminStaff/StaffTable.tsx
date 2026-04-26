import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type Header,
  type RowSelectionState,
  type SortingState,
  type Table,
  type Updater,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useMemo, useState } from 'react';
import { Button, ButtonGroup, Dropdown, Modal } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import {
  CategoricalColumnFilter,
  IndeterminateCheckbox,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  parseAsColumnPinningState,
  parseAsSortingState,
  useColumnVisibilityQueryState,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { getAppError } from '../../lib/client/errors.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { CourseInstanceAuthz } from '../../models/course-instances.js';
import type { CourseUsersRow } from '../../models/course-permissions.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { CourseStaffError } from '../../trpc/course/course-staff.js';

function useInvalidateStaffList() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return () => queryClient.invalidateQueries(trpc.courseStaff.list.queryFilter());
}

const COURSE_ROLE_VALUES = ['None', 'Previewer', 'Viewer', 'Editor', 'Owner'] as const;
type CourseRole = (typeof COURSE_ROLE_VALUES)[number];

const ROLE_DESCRIPTIONS: Record<CourseRole, string> = {
  None: 'Cannot see any course content.',
  Previewer:
    'Can see all questions, course instances, and assessments. Can see but not close issues. Cannot see any code or configuration files.',
  Viewer:
    'Can see all questions, course instances, and assessments. Can see but not close issues. Can see and download but not edit all code and configuration files.',
  Editor:
    'Can see all questions, course instances, and assessments. Can see and close issues. Can see, download, and edit all code and configuration files. Can sync course files to and from the GitHub repository.',
  Owner:
    'Can see all questions, course instances, and assessments. Can see and close issues. Can see, download, and edit all code and configuration files. Can sync course files to and from the GitHub repository. Can add and remove course staff and can change access roles.',
};

const LEARN_MORE_LINK = (
  <div className="text-start text-secondary mt-2 form-text">
    <a href="https://docs.prairielearn.com/course/#course-staff" target="_blank" rel="noreferrer">
      Learn more about GitHub access and course content / student data access levels
    </a>
  </div>
);

const INSTANCE_ROLE_VALUES = ['None', 'Student Data Viewer', 'Student Data Editor'] as const;
type InstanceRole = (typeof INSTANCE_ROLE_VALUES)[number];

const INSTANCE_ROLE_LABELS: Record<InstanceRole, string> = {
  None: 'None',
  'Student Data Viewer': 'Viewer',
  'Student Data Editor': 'Editor',
};

const INSTANCE_ROLE_DESCRIPTIONS: Record<InstanceRole, string> = {
  None: 'Cannot see any student data for this course instance.',
  'Student Data Viewer':
    'Can see all assessments, questions, and issues. Can view student data but cannot make changes.',
  'Student Data Editor':
    'Can see all assessments, questions, and issues. Can view and edit student data, including grading.',
};

function SelectAllCheckbox({ table }: { table: Table<CourseUsersRow> }) {
  return (
    <IndeterminateCheckbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      aria-label="Select all staff"
      onChange={() => table.toggleAllPageRowsSelected()}
    />
  );
}

const columnHelper = createColumnHelper<CourseUsersRow>();

const DEFAULT_SORT: SortingState = [
  { id: 'course_role', desc: true },
  { id: 'uid', desc: false },
];
const DEFAULT_PINNING: ColumnPinningState = { left: ['select', 'uid'], right: [] };

interface StaffTableInnerProps {
  courseInstances: CourseInstanceAuthz[];
  courseUsers: CourseUsersRow[];
  authnUserId: string;
  userId: string;
  isAdministrator: boolean;
  uidsLimit: number;
}

function courseRoleColor(role: CourseRole): string {
  switch (role) {
    case 'None':
      return 'light';
    case 'Previewer':
    case 'Viewer':
      return 'primary';
    case 'Editor':
      return 'success';
    case 'Owner':
      return 'warning';
  }
}

function instanceRoleColor(role: InstanceRole): string {
  switch (role) {
    case 'None':
      return 'light';
    case 'Student Data Viewer':
      return 'primary';
    case 'Student Data Editor':
      return 'success';
  }
}

function CoursePermissionCell({
  courseUser,
  canChangeCourseRole,
}: {
  courseUser: CourseUsersRow;
  canChangeCourseRole: boolean;
}) {
  const [show, setShow] = useState(false);
  const currentRole = courseUser.course_permission.course_role ?? 'None';
  const [selectedRole, setSelectedRole] = useState<CourseRole>(currentRole);

  const trpc = useTRPC();
  const invalidateStaffList = useInvalidateStaffList();
  const mutation = useMutation({
    ...trpc.courseStaff.updateCourseRole.mutationOptions(),
    onSuccess: () => {
      setShow(false);
      return invalidateStaffList();
    },
  });
  const appError = getAppError<CourseStaffError>(mutation.error);

  if (!canChangeCourseRole) {
    return (
      <span
        className={clsx(
          'btn btn-sm disabled',
          `bg-${courseRoleColor(currentRole)}-subtle`,
          `text-${courseRoleColor(currentRole)}-emphasis`,
        )}
        style={{ width: 110 }}
      >
        {currentRole}
      </span>
    );
  }

  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="right"
      popover={{
        props: {
          id: `course-permission-popover-${courseUser.user.id}`,
          className: 'popover-scrollable',
          style: { maxWidth: '400px' },
        },
        header: 'Change course content access',
        body: (
          <div>
            {COURSE_ROLE_VALUES.map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name={`course-role-${courseUser.user.id}`}
                  value={role}
                  id={`course-permission-input-${courseUser.user.id}-${role}`}
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                />
                <label
                  className="form-check-label"
                  htmlFor={`course-permission-input-${courseUser.user.id}-${role}`}
                >
                  {role}
                </label>
              </div>
            ))}
            <p className="small text-muted mt-2 mb-0">{ROLE_DESCRIPTIONS[selectedRole]}</p>
            {appError && <div className="alert alert-danger mt-2 mb-0">{appError.message}</div>}
            {LEARN_MORE_LINK}
            <div className="mt-3 text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary ms-2"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ userId: courseUser.user.id, courseRole: selectedRole })
                }
              >
                Change access
              </button>
            </div>
          </div>
        ),
      }}
      rootClose
      onToggle={(nextShow) => {
        if (nextShow) {
          setSelectedRole(currentRole);
          mutation.reset();
        }
        setShow(nextShow);
      }}
    >
      <button
        type="button"
        className={clsx(
          'btn btn-sm dropdown-toggle',
          `bg-${courseRoleColor(currentRole)}-subtle`,
          `text-${courseRoleColor(currentRole)}-emphasis`,
          currentRole === 'None' && 'btn-outline-dark',
        )}
        style={{ width: 110 }}
      >
        {currentRole}
      </button>
    </OverlayTrigger>
  );
}

function CourseInstanceAccessCell({
  courseUser,
  courseInstance,
  canChangeInstanceRole,
}: {
  courseUser: CourseUsersRow;
  courseInstance: CourseInstanceAuthz;
  canChangeInstanceRole: boolean;
}) {
  const existingRole = courseUser.course_instance_roles?.find(
    (cir) => cir.id === courseInstance.id,
  );
  const currentRole: InstanceRole = existingRole?.course_instance_role ?? 'None';
  const [show, setShow] = useState(false);
  const [selectedRole, setSelectedRole] = useState<InstanceRole>(currentRole);

  const trpc = useTRPC();
  const invalidateStaffList = useInvalidateStaffList();
  const mutation = useMutation({
    ...trpc.courseStaff.updateInstanceRole.mutationOptions(),
    onSuccess: () => {
      setShow(false);
      return invalidateStaffList();
    },
  });
  const appError = getAppError<CourseStaffError>(mutation.error);

  if (!canChangeInstanceRole) {
    return (
      <span
        className={clsx(
          'btn btn-sm disabled',
          `bg-${instanceRoleColor(currentRole)}-subtle`,
          `text-${instanceRoleColor(currentRole)}-emphasis`,
        )}
        style={{ width: 90 }}
      >
        {INSTANCE_ROLE_LABELS[currentRole]}
      </span>
    );
  }

  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="bottom"
      popover={{
        props: {
          id: `ci-permission-popover-${courseUser.user.id}-${courseInstance.id}`,
          className: 'popover-scrollable',
          style: { maxWidth: '400px' },
        },
        header: `Change student data access for ${courseInstance.short_name}`,
        body: (
          <div>
            {INSTANCE_ROLE_VALUES.map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name={`ci-role-${courseUser.user.id}-${courseInstance.id}`}
                  value={role}
                  id={`ci-permission-input-${courseUser.user.id}-${courseInstance.id}-${role}`}
                  checked={selectedRole === role}
                  onChange={() => setSelectedRole(role)}
                />
                <label
                  className="form-check-label"
                  htmlFor={`ci-permission-input-${courseUser.user.id}-${courseInstance.id}-${role}`}
                >
                  {INSTANCE_ROLE_LABELS[role]}
                </label>
              </div>
            ))}
            <p className="small text-muted mt-2 mb-0">{INSTANCE_ROLE_DESCRIPTIONS[selectedRole]}</p>
            {appError && <div className="alert alert-danger mt-2 mb-0">{appError.message}</div>}
            {LEARN_MORE_LINK}
            <div className="mt-3 text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary ms-2"
                disabled={selectedRole === currentRole || mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    userId: courseUser.user.id,
                    courseInstanceId: courseInstance.id,
                    courseInstanceRole: selectedRole,
                  })
                }
              >
                Change access
              </button>
            </div>
          </div>
        ),
      }}
      rootClose
      onToggle={(nextShow) => {
        if (nextShow) {
          setSelectedRole(currentRole);
          mutation.reset();
        }
        setShow(nextShow);
      }}
    >
      <button
        type="button"
        className={clsx(
          'btn btn-sm dropdown-toggle',
          `bg-${instanceRoleColor(currentRole)}-subtle`,
          `text-${instanceRoleColor(currentRole)}-emphasis`,
          currentRole === 'None' && 'btn-outline-dark',
        )}
        style={{ width: 90 }}
      >
        {INSTANCE_ROLE_LABELS[currentRole]}
      </button>
    </OverlayTrigger>
  );
}

function AddUsersModal({
  show,
  onHide,
  uidsLimit,
  courseInstances,
}: {
  show: boolean;
  onHide: () => void;
  uidsLimit: number;
  courseInstances: CourseInstanceAuthz[];
}) {
  const [uidText, setUidText] = useState('');
  const [courseRole, setCourseRole] = useState<CourseRole>('None');
  const [instanceRoles, setInstanceRoles] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);

  const resetState = () => {
    setUidText('');
    setCourseRole('None');
    setInstanceRoles({});
    setWarnings([]);
    mutation.reset();
  };

  const trpc = useTRPC();
  const invalidateStaffList = useInvalidateStaffList();
  const mutation = useMutation({
    ...trpc.courseStaff.insertByUserUids.mutationOptions(),
    onSuccess: (data) => {
      if (data.errors.length > 0) {
        setWarnings(data.errors);
      } else {
        onHide();
      }
      return invalidateStaffList();
    },
  });
  const appError = getAppError<CourseStaffError>(mutation.error);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWarnings([]);
    const uids = uidText.split(/[,;\s]+/).filter(Boolean);

    const courseInstanceChanges = Object.entries(instanceRoles)
      .filter((entry): entry is [string, 'Student Data Viewer' | 'Student Data Editor'] =>
        ['Student Data Viewer', 'Student Data Editor'].includes(entry[1]),
      )
      .map(([ciId, role]) => ({ courseInstanceId: ciId, courseInstanceRole: role }));

    mutation.mutate({
      uids,
      courseRole,
      ...(courseInstanceChanges.length > 0 ? { courseInstanceChanges } : {}),
    });
  };

  return (
    <Modal show={show} onHide={onHide} onExited={resetState}>
      <Modal.Header closeButton>
        <Modal.Title>Add users</Modal.Title>
      </Modal.Header>
      <form onSubmit={handleSubmit}>
        <Modal.Body>
          <p className="form-text">
            Use this form to add users to the course staff. Any UIDs of users who are already on the
            course staff will have their permissions updated only if the new permissions are higher
            than their existing permissions. All new users will be given the same access to course
            content and to student data.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="addUsersInputUid">
              UIDs:
            </label>
            <textarea
              className="form-control"
              id="addUsersInputUid"
              placeholder="staff1@example.com, staff2@example.com"
              aria-describedby="addUsersInputUidHelp"
              value={uidText}
              required
              onChange={(e) => setUidText(e.target.value)}
            />
            <small id="addUsersInputUidHelp" className="form-text text-muted">
              Enter up to {uidsLimit} UIDs separated by commas, semicolons, or whitespace.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="addUsersInputCourseRole">
              Course content access:
            </label>
            <select
              className="form-select form-select-sm"
              id="addUsersInputCourseRole"
              value={courseRole}
              required
              onChange={(e) => setCourseRole(e.target.value as CourseRole)}
            >
              <option value="None">None</option>
              <option value="Previewer">Previewer</option>
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
              <option value="Owner">Owner</option>
            </select>
          </div>
          {courseInstances.length > 0 && (
            <>
              <h6 className="font-weight-bolder">Student data access</h6>
              <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="table table-borderless table-sm align-middle mb-0">
                  <tbody>
                    {courseInstances.map((ci) => (
                      <tr key={ci.id}>
                        <td>{ci.short_name}</td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={instanceRoles[ci.id] ?? ''}
                            aria-label={`Role for ${ci.short_name ?? `course instance ${ci.id}`}`}
                            onChange={(e) =>
                              setInstanceRoles((prev) => ({ ...prev, [ci.id]: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            <option value="Student Data Viewer">Student data viewer</option>
                            <option value="Student Data Editor">Student data editor</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {warnings.length > 0 && (
            <div className="alert alert-warning mt-3 mb-0">
              <strong>Some users could not be added:</strong>
              <ul className="mb-0 mt-1">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {appError && <div className="alert alert-danger mt-3 mb-0">{appError.message}</div>}
          {LEARN_MORE_LINK}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={mutation.isPending}>
            Add users
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddUsersButton({
  uidsLimit,
  courseInstances,
}: {
  uidsLimit: number;
  courseInstances: CourseInstanceAuthz[];
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-label="Add users"
        data-testid="add-users-button"
        onClick={() => setShow(true)}
      >
        <i className="fas fa-users" aria-hidden="true" />
        <span className="d-none d-sm-inline"> Add users</span>
      </Button>
      <AddUsersModal
        courseInstances={courseInstances}
        show={show}
        uidsLimit={uidsLimit}
        onHide={() => setShow(false)}
      />
    </>
  );
}

function BulkDeleteModal({
  show,
  onHide,
  selectedUsers,
}: {
  show: boolean;
  onHide: () => void;
  selectedUsers: CourseUsersRow[];
}) {
  const trpc = useTRPC();
  const invalidateStaffList = useInvalidateStaffList();
  const mutation = useMutation({
    ...trpc.courseStaff.bulkDelete.mutationOptions(),
    onSuccess: () => {
      onHide();
      return invalidateStaffList();
    },
  });
  const appError = getAppError<CourseStaffError>(mutation.error);

  return (
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>Remove selected staff</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to remove{' '}
          <strong>
            {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'}
          </strong>{' '}
          from the course staff?
        </p>
        <ul className="mb-0" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {selectedUsers.map((u) => (
            <li key={u.user.id}>{u.user.name ?? u.user.uid}</li>
          ))}
        </ul>
        {appError && <div className="alert alert-danger mt-3 mb-0">{appError.message}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ userIds: selectedUsers.map((u) => u.user.id) })}
        >
          Remove {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function BulkEditAccessModal({
  show,
  onHide,
  selectedUsers,
  courseInstances,
}: {
  show: boolean;
  onHide: () => void;
  selectedUsers: CourseUsersRow[];
  courseInstances: CourseInstanceAuthz[];
}) {
  const [courseRole, setCourseRole] = useState<CourseRole | ''>('');
  const [instanceRoles, setInstanceRoles] = useState<Record<string, InstanceRole | ''>>({});

  const resetState = () => {
    setCourseRole('');
    setInstanceRoles({});
    mutation.reset();
  };

  const handleInstanceRoleChange = (ciId: string, role: InstanceRole | '') => {
    setInstanceRoles((prev) => ({ ...prev, [ciId]: role }));
  };

  const configuredInstances = Object.entries(instanceRoles).filter(
    (entry): entry is [string, InstanceRole] => entry[1] !== '',
  );
  const hasChanges = courseRole !== '' || configuredInstances.length > 0;

  const trpc = useTRPC();
  const invalidateStaffList = useInvalidateStaffList();
  const mutation = useMutation({
    ...trpc.courseStaff.bulkEditAccess.mutationOptions(),
    onSuccess: () => {
      onHide();
      return invalidateStaffList();
    },
  });
  const appError = getAppError<CourseStaffError>(mutation.error);

  const handleSubmit = () => {
    const userIds = selectedUsers.map((u) => u.user.id);
    const courseInstanceChanges = configuredInstances.map(([ciId, role]) => ({
      courseInstanceId: ciId,
      courseInstanceRole: role,
    }));

    mutation.mutate({
      userIds,
      ...(courseRole ? { courseRole } : {}),
      ...(courseInstanceChanges.length > 0 ? { courseInstanceChanges } : {}),
    });
  };

  return (
    <Modal show={show} size="md" onHide={onHide} onExited={resetState}>
      <Modal.Header closeButton>
        <Modal.Title>
          Edit access for {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h6 className="font-weight-bolder" id="course-role-label">
          Course content access
        </h6>
        <select
          className="form-select form-select-sm mb-3"
          aria-labelledby="course-role-label"
          value={courseRole}
          onChange={(e) => setCourseRole(e.target.value as CourseRole | '')}
        >
          <option value="">No change</option>
          {COURSE_ROLE_VALUES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        {courseInstances.length > 0 && (
          <>
            <h6 className="font-weight-bolder">Student data access</h6>
            <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table className="table table-borderless table-sm align-middle mb-0">
                <tbody>
                  {courseInstances.map((ci) => (
                    <tr key={ci.id}>
                      <td>{ci.short_name}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={instanceRoles[ci.id] ?? ''}
                          aria-label={`Role for ${ci.short_name ?? `course instance ${ci.id}`}`}
                          onChange={(e) =>
                            handleInstanceRoleChange(ci.id, e.target.value as InstanceRole | '')
                          }
                        >
                          <option value="">No change</option>
                          <option value="None">None (remove access)</option>
                          <option value="Student Data Viewer">Student data viewer</option>
                          <option value="Student Data Editor">Student data editor</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {appError && <div className="alert alert-danger mt-3 mb-0">{appError.message}</div>}
        {LEARN_MORE_LINK}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!hasChanges || mutation.isPending}
          onClick={handleSubmit}
        >
          Save changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function SelectionToolbar({
  selectedUsers,
  courseInstances,
  isAdministrator,
  authnUserId,
  userId,
}: {
  selectedUsers: CourseUsersRow[];
  courseInstances: CourseInstanceAuthz[];
  isAdministrator: boolean;
  authnUserId: string;
  userId: string;
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditAccessModal, setShowEditAccessModal] = useState(false);

  const modifiableUsers = selectedUsers.filter(
    (u) => (u.user.id !== authnUserId && u.user.id !== userId) || isAdministrator,
  );

  const deletableUsers = modifiableUsers.filter(
    (u) => isAdministrator || u.course_permission.course_role !== 'Owner',
  );

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        <Button
          variant="light"
          size="sm"
          disabled={modifiableUsers.length === 0}
          onClick={() => setShowEditAccessModal(true)}
        >
          <i className="fa fa-pen me-1" />
          Edit access
        </Button>
        <Button
          variant="light"
          size="sm"
          className="text-danger"
          disabled={deletableUsers.length === 0}
          onClick={() => setShowDeleteModal(true)}
        >
          <i className="fa fa-trash-alt me-1" />
          Delete
        </Button>
      </div>

      <BulkDeleteModal
        show={showDeleteModal}
        selectedUsers={deletableUsers}
        onHide={() => setShowDeleteModal(false)}
      />
      <BulkEditAccessModal
        show={showEditAccessModal}
        selectedUsers={modifiableUsers}
        courseInstances={courseInstances}
        onHide={() => setShowEditAccessModal(false)}
      />
    </>
  );
}

function StaffTableInner({
  courseInstances,
  courseUsers,
  authnUserId,
  userId,
  isAdministrator,
  uidsLimit,
}: StaffTableInnerProps) {
  const trpc = useTRPC();
  const { data: liveUsers } = useQuery({
    ...trpc.courseStaff.list.queryOptions(),
    initialData: courseUsers,
    staleTime: Infinity,
  });

  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [courseRoleFilter, setCourseRoleFilter] = useQueryState<CourseRole[]>(
    'role',
    parseAsArrayOf(parseAsStringLiteral(COURSE_ROLE_VALUES)).withDefault([]),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  const activeCourseInstanceIds = useMemo(() => {
    const now = new Date();
    return new Set(
      courseInstances
        .filter((ci) => {
          const hasStarted = !ci.start_date || ci.start_date <= now;
          const hasNotEnded = !ci.end_date || ci.end_date >= now;
          return hasStarted && hasNotEnded;
        })
        .map((ci) => ci.id),
    );
  }, [courseInstances]);

  const allColumnIds = useMemo(
    () => [
      'select',
      'uid',
      'user_name',
      'course_role',
      ...courseInstances.map((ci) => `ci_${ci.id}`),
    ],
    [courseInstances],
  );
  const { columnVisibility, setColumnVisibility, defaultColumnVisibility } =
    useColumnVisibilityQueryState(allColumnIds);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { createCheckboxProps } = useShiftClickCheckbox<CourseUsersRow>();

  const defaultInstanceFilterValues = useMemo(
    () =>
      Object.fromEntries(
        courseInstances.map((ci) => [
          `ci_${ci.id}`,
          parseAsArrayOf(parseAsStringLiteral(INSTANCE_ROLE_VALUES)).withDefault([]),
        ]),
      ),
    [courseInstances],
  );
  const [instanceFilterValues, setInstanceFilterValues] = useQueryStates(
    defaultInstanceFilterValues,
  );

  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      { id: 'course_role', value: courseRoleFilter },
      ...courseInstances.map((ci) => ({
        id: `ci_${ci.id}`,
        value: instanceFilterValues[`ci_${ci.id}`] ?? [],
      })),
    ],
    [courseRoleFilter, instanceFilterValues, courseInstances],
  );

  const columnFilterSetters = useMemo<Record<string, Updater<any>>>(
    () => ({
      select: undefined,
      uid: undefined,
      user_name: undefined,
      course_role: setCourseRoleFilter,
      ...Object.fromEntries(
        courseInstances.map((ci) => [
          `ci_${ci.id}`,
          (value: InstanceRole[]) =>
            setInstanceFilterValues((prev) => ({ ...prev, [`ci_${ci.id}`]: value })),
        ]),
      ),
    }),
    [setCourseRoleFilter, setInstanceFilterValues, courseInstances],
  );

  const handleColumnFiltersChange = useMemo(
    () => (updaterOrValue: Updater<ColumnFiltersState>) => {
      const newFilters =
        typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      for (const filter of newFilters) {
        columnFilterSetters[filter.id]?.(filter.value);
      }
    },
    [columnFilters, columnFilterSetters],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => <SelectAllCheckbox table={table} />,
        cell: ({ row, table }) => {
          const uid = row.original.user.uid;
          return (
            <input
              type="checkbox"
              aria-label={`Select ${uid}`}
              {...createCheckboxProps(row, table)}
            />
          );
        },
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor((row) => row.user.uid, {
        id: 'uid',
        header: 'UID',
        size: 220,
        enableHiding: true,
        enableGlobalFilter: true,
      }),
      columnHelper.accessor((row) => row.user.name ?? '', {
        id: 'user_name',
        header: 'Name',
        size: 180,
        enableHiding: true,
        enableGlobalFilter: true,
        cell: (info) => {
          const name = info.row.original.user.name;
          return name ? (
            <span>{name}</span>
          ) : (
            <OverlayTrigger
              placement="top"
              tooltip={{
                body: 'Users with name "Unknown user" either have never logged in or have an incorrect UID.',
                props: { id: `staff-unknown-user-tooltip-${info.row.original.user.id}` },
              }}
            >
              <span className="text-danger">Unknown user</span>
            </OverlayTrigger>
          );
        },
      }),
      columnHelper.accessor((row) => row.course_permission.course_role, {
        id: 'course_role',
        header: 'Course content',
        size: 190,
        enableHiding: true,
        enableGlobalFilter: false,
        meta: { label: 'Course content access' },
        filterFn: (row, _columnId, filterValues: CourseRole[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.course_permission.course_role ?? 'None');
        },
        sortingFn: (rowA, rowB) => {
          const indexA = COURSE_ROLE_VALUES.indexOf(
            rowA.original.course_permission.course_role ?? 'None',
          );
          const indexB = COURSE_ROLE_VALUES.indexOf(
            rowB.original.course_permission.course_role ?? 'None',
          );
          return indexA - indexB;
        },
        cell: (info) => (
          <div className="text-center">
            <CoursePermissionCell
              courseUser={info.row.original}
              canChangeCourseRole={
                (info.row.original.user.id !== authnUserId &&
                  info.row.original.user.id !== userId) ||
                isAdministrator
              }
            />
          </div>
        ),
      }),
      ...courseInstances.map((ci) =>
        columnHelper.accessor(
          (row): InstanceRole =>
            row.course_instance_roles?.find((cir) => cir.id === ci.id)?.course_instance_role ??
            'None',
          {
            id: `ci_${ci.id}`,
            header: () => <code>{ci.short_name ?? `Instance ${ci.id}`}</code>,
            meta: { label: ci.short_name ?? `Instance ${ci.id}` },
            size: 120,
            enableGlobalFilter: false,
            enableSorting: false,
            enableHiding: true,
            filterFn: (row, columnId, filterValues: InstanceRole[]) => {
              if (filterValues.length === 0) return true;
              const role = row.getValue<InstanceRole>(columnId);
              return filterValues.includes(role);
            },
            cell: (info) => (
              <div className="text-center">
                <CourseInstanceAccessCell
                  courseUser={info.row.original}
                  courseInstance={ci}
                  canChangeInstanceRole={
                    (info.row.original.user.id !== authnUserId &&
                      info.row.original.user.id !== userId) ||
                    isAdministrator
                  }
                />
              </div>
            ),
          },
        ),
      ),
    ],
    [authnUserId, userId, isAdministrator, courseInstances, createCheckboxProps],
  );

  const table = useReactTable({
    data: liveUsers,
    columns,
    columnResizeMode: 'onChange',
    enableRowSelection: true,
    getRowId: (row) => row.user.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnPinning,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 100,
      size: 150,
      maxSize: 500,
      enableSorting: true,
      enableHiding: false,
    },
  });

  const selectedUsers = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const displayedCount = table.getRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;
  const isFiltered = displayedCount !== totalCount;
  const selectedCount = selectedUsers.length;

  const statusContent = run(() => {
    if (selectedCount > 0) {
      return (
        <>
          Selected {selectedCount} of {displayedCount} {displayedCount === 1 ? 'user' : 'users'}
          {isFiltered && ' (filtered)'}
        </>
      );
    }
    return (
      <>
        Showing {displayedCount} of {totalCount} {totalCount === 1 ? 'user' : 'users'}
      </>
    );
  });

  const filters = useMemo(
    () => ({
      course_role: ({ header }: { header: Header<CourseUsersRow, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={[...COURSE_ROLE_VALUES]}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      ...Object.fromEntries(
        courseInstances.map((ci) => [
          `ci_${ci.id}`,
          ({ header }: { header: Header<CourseUsersRow, unknown> }) => (
            <CategoricalColumnFilter
              column={header.column}
              allColumnValues={[...INSTANCE_ROLE_VALUES]}
              renderValueLabel={({ value }) => <span>{INSTANCE_ROLE_LABELS[value]}</span>}
            />
          ),
        ]),
      ),
    }),
    [courseInstances],
  );

  const headerButtons = (
    <>
      {selectedUsers.length > 0 && (
        <SelectionToolbar
          selectedUsers={selectedUsers}
          courseInstances={courseInstances}
          isAdministrator={isAdministrator}
          authnUserId={authnUserId}
          userId={userId}
        />
      )}
      <AddUsersButton uidsLimit={uidsLimit} courseInstances={courseInstances} />
    </>
  );

  const instanceVisibilityPresets = useMemo(
    () => ({
      'Active instances': Object.fromEntries(
        courseInstances.map((ci) => [`ci_${ci.id}`, activeCourseInstanceIds.has(ci.id)]),
      ),
      'All instances': Object.fromEntries(courseInstances.map((ci) => [`ci_${ci.id}`, true])),
    }),
    [courseInstances, activeCourseInstanceIds],
  );

  const selectedViewPreset = useMemo(() => {
    for (const [name, preset] of Object.entries(instanceVisibilityPresets)) {
      const matches = Object.entries(preset).every(
        ([colId, visible]) => (columnVisibility[colId] ?? true) === visible,
      );
      if (matches) return name;
    }
    return null;
  }, [instanceVisibilityPresets, columnVisibility]);

  const handleViewPresetSelect = (presetName: string) => {
    const preset = instanceVisibilityPresets[presetName as keyof typeof instanceVisibilityPresets];
    void setColumnVisibility((prev) => ({ ...prev, ...preset }));
  };

  const allInstancesAreActive = activeCourseInstanceIds.size === courseInstances.length;

  const viewPresetDropdown =
    courseInstances.length > 0 && !allInstancesAreActive ? (
      <Dropdown as={ButtonGroup}>
        <Dropdown.Toggle variant="tanstack-table">
          <i className="bi bi-funnel me-2" aria-hidden="true" />
          View: {selectedViewPreset ?? 'Custom'}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {Object.keys(instanceVisibilityPresets).map((name) => {
            const isSelected = selectedViewPreset === name;
            return (
              <Dropdown.Item
                key={name}
                as="button"
                type="button"
                active={isSelected}
                onClick={() => handleViewPresetSelect(name)}
              >
                <i
                  className={`bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'} me-2`}
                  aria-hidden="true"
                />
                {name}
              </Dropdown.Item>
            );
          })}
          {selectedViewPreset === null && (
            <Dropdown.Item as="button" type="button" active disabled>
              <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
              Custom
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown>
    ) : null;

  return (
    <div className="d-flex flex-column h-100">
      <div className="staff-table flex-grow-1" style={{ minHeight: 0 }}>
        <TanstackTableCard
          table={table}
          title="Staff"
          className="h-100"
          singularLabel="user"
          pluralLabel="users"
          globalFilter={{ placeholder: 'Search by UID or name...' }}
          tableOptions={{ filters, rowHeight: 72 }}
          headerButtons={headerButtons}
          columnManager={{ buttons: viewPresetDropdown }}
          statusContent={statusContent}
        />
      </div>
    </div>
  );
}

interface StaffTableProps extends StaffTableInnerProps {
  search: string;
  trpcCsrfToken: string;
  courseId: string;
}

export function StaffTable({ search, trpcCsrfToken, courseId, ...props }: StaffTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={false}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <NuqsAdapter search={search}>
          <StaffTableInner {...props} />
        </NuqsAdapter>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

StaffTable.displayName = 'StaffTable';
