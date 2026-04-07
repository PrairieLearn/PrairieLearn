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
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import {
  CategoricalColumnFilter,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  parseAsColumnPinningState,
  parseAsSortingState,
  useColumnVisibilityQueryState,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import type { CourseInstance } from '../../lib/db-types.js';

import type { CourseUsersRow } from './instructorCourseAdminStaff.types.js';

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

function IndeterminateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  'aria-label': string;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
    />
  );
}

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

const DEFAULT_SORT: SortingState = [{ id: 'uid', desc: false }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['select', 'uid'], right: [] };

interface StaffTableInnerProps {
  csrfToken: string;
  courseInstances: CourseInstance[];
  courseUsers: CourseUsersRow[];
  authnUserId: string;
  userId: string;
  isAdministrator: boolean;
  uidsLimit: number;
  githubAccessLink: string | null;
}

function courseRoleColor(role: CourseRole): string {
  switch (role) {
    case 'None':
      return 'secondary';
    case 'Previewer':
    case 'Viewer':
      return 'primary';
    case 'Editor':
      return 'success';
    case 'Owner':
      return 'dark';
  }
}

function instanceRoleColor(role: InstanceRole): string {
  switch (role) {
    case 'None':
      return 'secondary';
    case 'Student Data Viewer':
      return 'primary';
    case 'Student Data Editor':
      return 'success';
  }
}

function CoursePermissionCell({
  courseUser,
  canChangeCourseRole,
  csrfToken,
}: {
  courseUser: CourseUsersRow;
  canChangeCourseRole: boolean;
  csrfToken: string;
}) {
  const [show, setShow] = useState(false);
  const currentRole = courseUser.course_permission.course_role ?? 'None';
  const [selectedRole, setSelectedRole] = useState<CourseRole>(currentRole);

  if (!canChangeCourseRole) {
    return (
      <span
        className={`btn btn-sm bg-${courseRoleColor(currentRole)}-subtle text-${courseRoleColor(currentRole)}-emphasis disabled`}
        style={{ width: 105 }}
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
          <form method="POST">
            <input type="hidden" name="__action" value="course_permissions_update_role" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="user_id" value={courseUser.user.id} />
            {COURSE_ROLE_VALUES.map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="course_role"
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
            <div className="mt-3 text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary ms-2">
                Change access
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <button
        type="button"
        className={`btn btn-sm bg-${courseRoleColor(currentRole)}-subtle text-${courseRoleColor(currentRole)}-emphasis dropdown-toggle`}
        style={{ width: 105 }}
      >
        {currentRole}
      </button>
    </OverlayTrigger>
  );
}

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

function CourseInstanceAccessCell({
  courseUser,
  courseInstance,
  csrfToken,
}: {
  courseUser: CourseUsersRow;
  courseInstance: CourseInstance;
  csrfToken: string;
}) {
  const existingRole = courseUser.course_instance_roles?.find(
    (cir) => String(cir.id) === String(courseInstance.id),
  );
  const currentRole: InstanceRole = existingRole?.course_instance_role ?? 'None';
  const [show, setShow] = useState(false);
  const [selectedRole, setSelectedRole] = useState<InstanceRole>(currentRole);

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
          <form method="POST">
            <input
              type="hidden"
              name="__action"
              value={
                currentRole === 'None'
                  ? 'course_instance_permissions_insert'
                  : 'course_instance_permissions_update_role_or_delete'
              }
            />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="user_id" value={courseUser.user.id} />
            <input type="hidden" name="course_instance_id" value={courseInstance.id} />
            {INSTANCE_ROLE_VALUES.map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="course_instance_role"
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
            <div className="mt-3 text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary ms-2"
                disabled={selectedRole === currentRole}
              >
                Change access
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <button
        type="button"
        className={`btn btn-sm bg-${instanceRoleColor(currentRole)}-subtle text-${instanceRoleColor(currentRole)}-emphasis dropdown-toggle`}
        style={{ width: 105 }}
      >
        {INSTANCE_ROLE_LABELS[currentRole]}
      </button>
    </OverlayTrigger>
  );
}

function AddUsersModal({
  show,
  onHide,
  csrfToken,
  uidsLimit,
  courseInstances,
}: {
  show: boolean;
  onHide: () => void;
  csrfToken: string;
  uidsLimit: number;
  courseInstances: CourseInstance[];
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Add users</Modal.Title>
      </Modal.Header>
      <form method="POST">
        <Modal.Body>
          <input type="hidden" name="__action" value="course_permissions_insert_by_user_uids" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
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
              name="uid"
              placeholder="staff1@example.com, staff2@example.com"
              aria-describedby="addUsersInputUidHelp"
              required
            />
            <small id="addUsersInputUidHelp" className="form-text text-muted">
              Enter up to {uidsLimit} UIDs separated by commas, semicolons, or whitespace.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="addUsersInputCourseRole">
              Course content access for all new users:
            </label>
            <select
              className="form-select form-select-sm"
              id="addUsersInputCourseRole"
              name="course_role"
              defaultValue="None"
              required
            >
              <option value="None">None</option>
              <option value="Previewer">Previewer</option>
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
              <option value="Owner">Owner</option>
            </select>
          </div>
          {courseInstances.length > 0 && (
            <div className="mb-3">
              <label className="form-label" htmlFor="addUsersInputCourseInstance">
                Student data access for all new users:
              </label>
              <div className="input-group">
                <select
                  className="form-select form-select-sm"
                  id="addUsersInputCourseInstance"
                  name="course_instance_id"
                  aria-label="Course instance for student data access"
                >
                  <option value="">None</option>
                  {courseInstances.map((ci) => (
                    <option key={ci.id} value={ci.id}>
                      {ci.short_name}
                    </option>
                  ))}
                </select>
                <select
                  className="form-select form-select-sm"
                  id="addUsersInputCourseInstanceRole"
                  name="course_instance_role"
                  aria-label="Role for student data access"
                >
                  <option value="Student Data Viewer">Viewer</option>
                  <option value="Student Data Editor">Editor</option>
                </select>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Add users
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddUsersButton({
  csrfToken,
  uidsLimit,
  courseInstances,
}: {
  csrfToken: string;
  uidsLimit: number;
  courseInstances: CourseInstance[];
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
        csrfToken={csrfToken}
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
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  selectedUsers: CourseUsersRow[];
  csrfToken: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Remove selected staff</Modal.Title>
      </Modal.Header>
      <form method="POST">
        <Modal.Body>
          <input type="hidden" name="__action" value="bulk_course_permissions_delete" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          {selectedUsers.map((u) => (
            <input key={u.user.id} type="hidden" name="user_ids" value={u.user.id} />
          ))}
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
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Cancel
          </Button>
          <Button variant="danger" type="submit">
            Remove {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function BulkEditAccessModal({
  show,
  onHide,
  selectedUsers,
  courseInstances,
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  selectedUsers: CourseUsersRow[];
  courseInstances: CourseInstance[];
  csrfToken: string;
}) {
  const [courseRole, setCourseRole] = useState('');
  const [instanceRoles, setInstanceRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!show) {
      setCourseRole('');
      setInstanceRoles({});
    }
  }, [show]);

  const handleInstanceRoleChange = (ciId: string, role: string) => {
    setInstanceRoles((prev) => ({ ...prev, [ciId]: role }));
  };

  const configuredInstances = Object.entries(instanceRoles).filter(([, role]) => role !== '');
  const hasChanges = courseRole !== '' || configuredInstances.length > 0;

  return (
    <Modal show={show} size="lg" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Edit access</Modal.Title>
      </Modal.Header>
      <form method="POST">
        <Modal.Body>
          <input type="hidden" name="__action" value="bulk_edit_access" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          {selectedUsers.map((u) => (
            <input key={u.user.id} type="hidden" name="user_ids" value={u.user.id} />
          ))}
          <input type="hidden" name="course_role" value={courseRole} />
          {configuredInstances.map(([ciId, role]) => (
            <span key={ciId}>
              <input type="hidden" name="course_instance_ids" value={ciId} />
              <input type="hidden" name="course_instance_roles" value={role} />
            </span>
          ))}
          <p>
            Edit access for{' '}
            <strong>
              {selectedUsers.length} {selectedUsers.length === 1 ? 'user' : 'users'}
            </strong>
            :
          </p>

          <h6 className="font-weight-bolder" id="course-role-label">
            Course content access
          </h6>
          <select
            className="form-select form-select-sm mb-3"
            aria-labelledby="course-role-label"
            value={courseRole}
            onChange={(e) => setCourseRole(e.target.value)}
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
                  {/* <thead>
                    <tr>
                      <th>Course instance</th>
                      <th style={{ width: '220px' }}>Access level</th>
                    </tr>
                  </thead> */}
                  <tbody>
                    {courseInstances.map((ci) => (
                      <tr key={ci.id}>
                        <td>{ci.short_name}</td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={instanceRoles[ci.id] ?? ''}
                            aria-label={`Role for ${ci.short_name ?? `course instance ${ci.id}`}`}
                            onChange={(e) => handleInstanceRoleChange(ci.id, e.target.value)}
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
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!hasChanges}>
            Save changes
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function SelectionToolbar({
  selectedUsers,
  csrfToken,
  courseInstances,
  isAdministrator,
  authnUserId,
  userId,
}: {
  selectedUsers: CourseUsersRow[];
  csrfToken: string;
  courseInstances: CourseInstance[];
  isAdministrator: boolean;
  authnUserId: string;
  userId: string;
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditAccessModal, setShowEditAccessModal] = useState(false);

  // Filter out users that can't be modified (current user / owners unless admin)
  const deletableUsers = selectedUsers.filter(
    (u) => (u.user.id !== authnUserId && u.user.id !== userId) || isAdministrator,
  );

  const modifiableUsers = selectedUsers.filter(
    (u) => (u.user.id !== authnUserId && u.user.id !== userId) || isAdministrator,
  );

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        <span className="text-white small">{selectedUsers.length} selected</span>
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
          variant="danger"
          size="sm"
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
        csrfToken={csrfToken}
        onHide={() => setShowDeleteModal(false)}
      />
      <BulkEditAccessModal
        show={showEditAccessModal}
        selectedUsers={modifiableUsers}
        courseInstances={courseInstances}
        csrfToken={csrfToken}
        onHide={() => setShowEditAccessModal(false)}
      />
    </>
  );
}

function StaffTableInner({
  csrfToken,
  courseInstances,
  courseUsers,
  authnUserId,
  userId,
  isAdministrator,
  uidsLimit,
  githubAccessLink,
}: StaffTableInnerProps) {
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
  const [selectedIds, setSelectedIds] = useQueryState(
    'selected',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

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

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(selectedIds.map((id) => [id, true])),
    [selectedIds],
  );
  const setRowSelection = useMemo(
    () =>
      (updaterOrValue: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
        const newSelection =
          typeof updaterOrValue === 'function' ? updaterOrValue(rowSelection) : updaterOrValue;
        void setSelectedIds(
          Object.entries(newSelection)
            .filter(([, selected]) => selected)
            .map(([id]) => id),
        );
      },
    [rowSelection, setSelectedIds],
  );
  const { createCheckboxProps } = useShiftClickCheckbox<CourseUsersRow>();

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (courseRoleFilter.length > 0) {
      filters.push({ id: 'course_role', value: courseRoleFilter });
    }
    return filters;
  }, [courseRoleFilter]);

  const handleColumnFiltersChange = useMemo(
    () => (updaterOrValue: Updater<ColumnFiltersState>) => {
      const newFilters =
        typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      const roleFilterEntry = newFilters.find((f) => f.id === 'course_role');
      void setCourseRoleFilter(roleFilterEntry ? (roleFilterEntry.value as CourseRole[]) : []);
    },
    [columnFilters, setCourseRoleFilter],
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
        enableGlobalFilter: true,
        cell: (info) => (
          <span
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => info.row.toggleSelected()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                info.row.toggleSelected();
              }
            }}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.user.name ?? '', {
        id: 'user_name',
        header: 'Name',
        size: 180,
        enableGlobalFilter: true,
        cell: (info) => {
          const name = info.row.original.user.name;
          return (
            <span
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onClick={() => info.row.toggleSelected()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  info.row.toggleSelected();
                }
              }}
            >
              {name ?? (
                <OverlayTrigger
                  placement="top"
                  tooltip={{
                    body: 'Users with name "Unknown user" either have never logged in or have an incorrect UID.',
                    props: { id: `staff-unknown-user-tooltip-${info.row.original.user.id}` },
                  }}
                >
                  <span className="text-danger">Unknown user</span>
                </OverlayTrigger>
              )}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.course_permission.course_role, {
        id: 'course_role',
        header: 'Course content',
        size: 190,
        enableGlobalFilter: false,
        meta: { label: 'Course content access' },
        filterFn: (row, _columnId, filterValues: CourseRole[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.course_permission.course_role!);
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
              csrfToken={csrfToken}
            />
          </div>
        ),
      }),
      ...courseInstances.map((ci) =>
        columnHelper.display({
          id: `ci_${ci.id}`,
          header: () => <code>{ci.short_name ?? `Instance ${ci.id}`}</code>,
          size: 120,
          enableGlobalFilter: false,
          enableSorting: false,
          enableHiding: true,
          cell: (info) => (
            <div className="text-center">
              <CourseInstanceAccessCell
                courseUser={info.row.original}
                courseInstance={ci}
                csrfToken={csrfToken}
              />
            </div>
          ),
        }),
      ),
    ],
    [authnUserId, userId, isAdministrator, csrfToken, courseInstances, createCheckboxProps],
  );

  const table = useReactTable({
    data: courseUsers,
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

  const filters = useMemo(
    () => ({
      course_role: ({ header }: { header: Header<CourseUsersRow, unknown> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={[...COURSE_ROLE_VALUES]}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
    }),
    [],
  );

  const headerButtons = (
    <>
      {selectedUsers.length > 0 && (
        <SelectionToolbar
          selectedUsers={selectedUsers}
          csrfToken={csrfToken}
          courseInstances={courseInstances}
          isAdministrator={isAdministrator}
          authnUserId={authnUserId}
          userId={userId}
        />
      )}
      <AddUsersButton
        csrfToken={csrfToken}
        uidsLimit={uidsLimit}
        courseInstances={courseInstances}
      />
    </>
  );

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
        />
      </div>
      <div className="small flex-shrink-0 border-top pt-3 text-end">
        <a
          href="https://docs.prairielearn.com/course/#course-staff"
          target="_blank"
          rel="noreferrer"
        >
          Learn more about content and student data access levels{' '}
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </a>
        {githubAccessLink && (
          <div className="alert alert-info mt-3">
            The settings above do not affect access to the course&apos;s Git repository. To change
            repository permissions, go to the{' '}
            <a className="alert-link" href={githubAccessLink} target="_blank" rel="noreferrer">
              GitHub access settings page
            </a>
            .
          </div>
        )}
      </div>
    </div>
  );
}

interface StaffTableProps extends StaffTableInnerProps {
  search: string;
}

export function StaffTable({ search, ...props }: StaffTableProps) {
  return (
    <NuqsAdapter search={search}>
      <StaffTableInner {...props} />
    </NuqsAdapter>
  );
}

StaffTable.displayName = 'StaffTable';
