import {
  type ColumnFiltersState,
  type Header,
  type SortingState,
  type Updater,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';

import {
  CategoricalColumnFilter,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  parseAsSortingState,
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

const columnHelper = createColumnHelper<CourseUsersRow>();

const DEFAULT_SORT: SortingState = [{ id: 'uid', desc: false }];

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
  const currentRole = courseUser.course_permission.course_role!;

  if (!canChangeCourseRole) {
    return (
      <Button variant="outline-primary" size="sm" disabled>
        {currentRole}
      </Button>
    );
  }

  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: {
          id: `course-permission-popover-${courseUser.user.id}`,
          className: 'popover-wide popover-scrollable',
        },
        header: 'Change course content access',
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="course_permissions_update_role" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="user_id" value={courseUser.user.id} />
            <p className="d-none d-sm-block">
              Users with course content access can see aggregate student data (e.g., mean scores),
              but cannot see the names or scores of individual students without also having student
              data access to a particular course instance.
            </p>
            {COURSE_ROLE_VALUES.map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="course_role"
                  value={role}
                  id={`course-permission-input-${courseUser.user.id}-${role}`}
                  defaultChecked={currentRole === role}
                />
                <label
                  className="form-check-label"
                  htmlFor={`course-permission-input-${courseUser.user.id}-${role}`}
                >
                  <h6>{role}</h6>
                  <p className="small text-muted d-none d-sm-block">{ROLE_DESCRIPTIONS[role]}</p>
                </label>
              </div>
            ))}
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
      <Button type="button" variant="outline-primary" size="sm" className="dropdown-toggle">
        {currentRole}
      </Button>
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

  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: {
          id: `ci-permission-popover-${courseUser.user.id}-${courseInstance.id}`,
          className: 'popover-wide popover-scrollable',
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
            <p className="d-none d-sm-block">
              Users with student data access can see all assessments in the course instance{' '}
              <code>{courseInstance.short_name}</code>, can see all questions, and can see issues.
              They cannot see any code or configuration files, or close issues, without also having
              course content access.
            </p>
            {INSTANCE_ROLE_VALUES.filter(
              (role) => !(role === 'None' && currentRole === 'None'),
            ).map((role) => (
              <div key={role} className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="course_instance_role"
                  value={role}
                  id={`ci-permission-input-${courseUser.user.id}-${courseInstance.id}-${role}`}
                  defaultChecked={currentRole === role}
                />
                <label
                  className="form-check-label"
                  htmlFor={`ci-permission-input-${courseUser.user.id}-${courseInstance.id}-${role}`}
                >
                  <h6>{INSTANCE_ROLE_LABELS[role]}</h6>
                </label>
              </div>
            ))}
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
      <Button type="button" variant="outline-primary" size="sm" className="dropdown-toggle">
        {INSTANCE_ROLE_LABELS[currentRole]}
      </Button>
    </OverlayTrigger>
  );
}

function RemoveStaffCell({
  courseUser,
  csrfToken,
}: {
  courseUser: CourseUsersRow;
  csrfToken: string;
}) {
  const [show, setShow] = useState(false);
  const displayName = courseUser.user.name ?? courseUser.user.uid;

  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: {
          id: `remove-staff-popover-${courseUser.user.id}`,
          className: 'popover-wide',
        },
        header: `Remove ${displayName}`,
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="course_permissions_delete" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="user_id" value={courseUser.user.id} />
            <div className="mb-3">
              <p className="form-text">
                Taking this action will remove {displayName} from course staff.
              </p>
            </div>
            <div className="text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger ms-2">
                Remove
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <Button
        type="button"
        variant="outline-dark"
        size="sm"
        aria-label={`Remove ${displayName}`}
        data-testid="remove-staff-button"
      >
        <i className="fa fa-times" /> Remove
      </Button>
    </OverlayTrigger>
  );
}

function RemoveAllStudentDataAccessButton({ csrfToken }: { csrfToken: string }) {
  const [show, setShow] = useState(false);
  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: { id: 'remove-all-student-data-access-popover', className: 'popover-wide' },
        header: 'Remove all student data access',
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="remove_all_student_data_access" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div className="mb-3">
              <p className="form-text">
                Taking this action will remove all student data access from all users (but will
                leave these users on the course staff).
              </p>
            </div>
            <div className="text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger ms-2">
                Remove all student data access
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-label="Remove all student data access"
        data-testid="remove-all-student-data-access-button"
      >
        <i className="fas fa-eye-slash" aria-hidden="true" />
        <span className="d-none d-sm-inline"> Remove all student data access</span>
      </Button>
    </OverlayTrigger>
  );
}

function DeleteNoAccessButton({ csrfToken }: { csrfToken: string }) {
  const [show, setShow] = useState(false);
  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: { id: 'delete-no-access-popover', className: 'popover-wide' },
        header: 'Delete users with no access',
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="delete_no_access" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div className="mb-3">
              <p className="form-text">
                Taking this action will remove every user from course staff who has neither course
                content access nor student data access.
              </p>
            </div>
            <div className="text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger ms-2">
                Delete users with no access
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-label="Delete users with no access"
        data-testid="delete-users-with-no-access-button"
      >
        <i className="fas fa-recycle" aria-hidden="true" />
        <span className="d-none d-sm-inline"> Delete users with no access</span>
      </Button>
    </OverlayTrigger>
  );
}

function DeleteNonOwnersButton({ csrfToken }: { csrfToken: string }) {
  const [show, setShow] = useState(false);
  return (
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: { id: 'delete-non-owners-popover', className: 'popover-wide' },
        header: 'Delete non-owners',
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="delete_non_owners" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div className="mb-3">
              <p className="form-text">
                Taking this action will remove every user from course staff who is not a course
                content Owner.
              </p>
            </div>
            <div className="text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger ms-2">
                Delete non-owners
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-label="Delete non-owners"
        data-testid="delete-non-owners-button"
      >
        <i className="fas fa-users-slash" aria-hidden="true" />
        <span className="d-none d-sm-inline"> Delete non-owners</span>
      </Button>
    </OverlayTrigger>
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
    <OverlayTrigger
      show={show}
      trigger="click"
      placement="auto"
      popover={{
        props: { id: 'add-users-popover', className: 'popover-wide' },
        header: 'Add users',
        body: (
          <form method="POST">
            <input type="hidden" name="__action" value="course_permissions_insert_by_user_uids" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div className="mb-3">
              <p className="form-text">
                Use this form to add users to the course staff. Any UIDs of users who are already on
                the course staff will have their permissions updated only if the new permissions are
                higher than their existing permissions. All new users will be given the same access
                to course content and to student data.
              </p>
            </div>
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
                required
              >
                <option value="None" defaultValue="None">
                  None
                </option>
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
                  >
                    <option value="Student Data Viewer">Viewer</option>
                    <option value="Student Data Editor">Editor</option>
                  </select>
                </div>
              </div>
            )}
            <div className="text-end">
              <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary ms-2">
                Add users
              </button>
            </div>
          </form>
        ),
      }}
      rootClose
      onToggle={setShow}
    >
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-label="Add users"
        data-testid="add-users-button"
      >
        <i className="fas fa-users" aria-hidden="true" />
        <span className="d-none d-sm-inline"> Add users</span>
      </Button>
    </OverlayTrigger>
  );
}

function AccessLevelsTable() {
  return (
    <div className="table-responsive">
      <table
        className="table table-striped table-sm border mb-0"
        style={{ maxWidth: '45em' }}
        aria-label="Recommended access levels"
      >
        <thead>
          <tr>
            <th>Role</th>
            <th className="text-center">Course content access</th>
            <th className="text-center">Student data access</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Instructor</td>
            <td className="text-center">Course content owner</td>
            <td className="text-center">Student data editor</td>
          </tr>
          <tr>
            <td>TAs developing course content</td>
            <td className="text-center">Course content editor</td>
            <td className="text-center">Student data editor</td>
          </tr>
          <tr>
            <td>Student content developers (not TAs)</td>
            <td className="text-center">Course content editor</td>
            <td className="text-center">None</td>
          </tr>
          <tr>
            <td>TAs involved in grading</td>
            <td className="text-center">None</td>
            <td className="text-center">Student data editor</td>
          </tr>
          <tr>
            <td>Other TAs</td>
            <td className="text-center">None</td>
            <td className="text-center">Student data viewer</td>
          </tr>
          <tr>
            <td>Instructors from other classes</td>
            <td className="text-center">Course content viewer</td>
            <td className="text-center">None</td>
          </tr>
        </tbody>
      </table>
    </div>
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
      columnHelper.accessor((row) => row.user.uid, {
        id: 'uid',
        header: 'UID',
        size: 200,
        enableGlobalFilter: true,
      }),
      columnHelper.accessor((row) => row.user.name ?? '', {
        id: 'user_name',
        header: 'Name',
        size: 220,
        enableGlobalFilter: true,
        cell: (info) => {
          const name = info.row.original.user.name;
          return name ?? <span className="text-danger">Unknown user</span>;
        },
      }),
      columnHelper.accessor((row) => row.course_permission.course_role, {
        id: 'course_role',
        header: 'Course content access',
        size: 210,
        enableGlobalFilter: false,
        meta: { label: 'Course content access' },
        filterFn: (row, _columnId, filterValues: CourseRole[]) => {
          if (filterValues.length === 0) return true;
          return filterValues.includes(row.original.course_permission.course_role!);
        },
        cell: (info) => (
          <CoursePermissionCell
            courseUser={info.row.original}
            canChangeCourseRole={
              (info.row.original.user.id !== authnUserId && info.row.original.user.id !== userId) ||
              isAdministrator
            }
            csrfToken={csrfToken}
          />
        ),
      }),
      ...courseInstances.map((ci) =>
        columnHelper.display({
          id: `ci_${ci.id}`,
          header: ci.short_name ?? `Instance ${ci.id}`,
          size: 150,
          enableGlobalFilter: false,
          enableSorting: false,
          cell: (info) => (
            <CourseInstanceAccessCell
              courseUser={info.row.original}
              courseInstance={ci}
              csrfToken={csrfToken}
            />
          ),
        }),
      ),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 130,
        enableGlobalFilter: false,
        enableSorting: false,
        cell: (info) =>
          info.row.original.course_permission.course_role !== 'Owner' || isAdministrator ? (
            <RemoveStaffCell courseUser={info.row.original} csrfToken={csrfToken} />
          ) : null,
      }),
    ],
    [authnUserId, userId, isAdministrator, csrfToken, courseInstances],
  );

  const table = useReactTable({
    data: courseUsers,
    columns,
    columnResizeMode: 'onChange',
    enableHiding: false,
    getRowId: (row) => row.user.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: handleColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      size: 150,
      maxSize: 600,
      enableSorting: true,
      enableHiding: false,
    },
  });

  const hasUnknownUsers = courseUsers.some((u) => u.user.name == null);

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
      <RemoveAllStudentDataAccessButton csrfToken={csrfToken} />
      <DeleteNoAccessButton csrfToken={csrfToken} />
      <DeleteNonOwnersButton csrfToken={csrfToken} />
      <AddUsersButton
        csrfToken={csrfToken}
        uidsLimit={uidsLimit}
        courseInstances={courseInstances}
      />
    </>
  );

  return (
    <div className="d-flex flex-column h-100">
      <TanstackTableCard
        table={table}
        title="Staff"
        singularLabel="user"
        pluralLabel="users"
        headerButtons={headerButtons}
        globalFilter={{ placeholder: 'Search by UID or name...' }}
        tableOptions={{
          filters,
          rowHeight: 72,
        }}
        className="flex-grow-1 mb-0"
        style={{ minHeight: 0 }}
      />
      <div className="small flex-shrink-0 border-top p-3">
        {hasUnknownUsers && (
          <p className="alert alert-warning">
            Users with name &quot;<span className="text-danger">Unknown user</span>&quot; either
            have never logged in or have an incorrect UID.
          </p>
        )}
        <details>
          <summary>Recommended access levels</summary>
          <AccessLevelsTable />
        </details>
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
