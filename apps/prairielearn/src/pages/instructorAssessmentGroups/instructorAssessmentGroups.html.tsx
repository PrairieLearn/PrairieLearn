import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Dropdown, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { getAppError } from '../../lib/client/errors.js';
import { type StaffGroupConfig } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { GroupUsersRow } from '../../models/group.js';
import type { AssessmentGroupsError } from '../../trpc/assessment/assessment-groups.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

type SortKey = 'name' | 'size' | 'members';
type SortDir = 'asc' | 'desc';

function memberString(row: GroupUsersRow): string {
  return row.users.map((u) => u.uid).join(', ');
}

function compareGroups(a: GroupUsersRow, b: GroupUsersRow, key: SortKey): number {
  if (key === 'size') return a.size - b.size;
  if (key === 'members') return memberString(a).localeCompare(memberString(b));
  return a.name.localeCompare(b.name);
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
  const icon =
    active === 'asc'
      ? 'bi-chevron-up'
      : active === 'desc'
        ? 'bi-chevron-down'
        : 'bi-chevron-expand text-muted';
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-reset text-decoration-none fw-bold"
        onClick={() => onSort(sortKey)}
      >
        {label} <i className={`bi ${icon}`} aria-hidden="true" />
      </button>
    </th>
  );
}

interface InstructorAssessmentGroupsProps {
  groupsCsvFilename?: string;
  groupConfigInfo?: StaffGroupConfig;
  groups?: GroupUsersRow[];
  notAssigned?: string[];
  resLocals: ResLocalsForPage<'assessment'>;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

export function InstructorAssessmentGroups({
  trpcCsrfToken,
  isDevMode,
  resLocals,
  ...rest
}: InstructorAssessmentGroupsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: resLocals.course_instance.id,
      assessmentId: resLocals.assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentGroupsInner resLocals={resLocals} {...rest} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentGroups.displayName = 'InstructorAssessmentGroups';

function InstructorAssessmentGroupsInner({
  groupsCsvFilename,
  groupConfigInfo,
  groups: initialGroups,
  notAssigned: initialNotAssigned,
  resLocals,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const [showUploadAssessmentGroupsModal, setShowUploadAssessmentGroupsModal] = useState(false);
  const [showRandomAssessmentGroupsModal, setShowRandomAssessmentGroupsModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showDeleteAllGroupsModal, setShowDeleteAllGroupsModal] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [notAssigned, setNotAssigned] = useState(initialNotAssigned);

  const handleGroupAdded = (group: GroupUsersRow, newNotAssigned: string[]) => {
    setGroups((prev) => [...(prev ?? []), group]);
    setNotAssigned(newNotAssigned);
  };

  const handleGroupUpdated = (group: GroupUsersRow, newNotAssigned: string[]) => {
    setGroups((prev) => prev?.map((g) => (g.group_id === group.group_id ? group : g)));
    setNotAssigned(newNotAssigned);
  };

  const handleGroupDeleted = (groupId: string, newNotAssigned: string[]) => {
    setGroups((prev) => prev?.filter((g) => g.group_id !== groupId));
    setNotAssigned(newNotAssigned);
  };

  const handleAllGroupsDeleted = (newNotAssigned: string[]) => {
    setGroups([]);
    setNotAssigned(newNotAssigned);
  };

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const sortedGroups = run(() => {
    if (!groups || !sort) return groups;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...groups].sort((a, b) => sign * compareGroups(a, b, sort.key));
  });

  if (!groupConfigInfo) {
    return (
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {resLocals.assessment_set.name} {resLocals.assessment.number}: Groups
          </h1>
        </div>
        <div className="card-body">
          This is not a group assessment. To enable this functionality, please set
          <code>"groupWork": true</code> in <code>infoAssessment.json</code>.
        </div>
      </div>
    );
  }

  return (
    <>
      {resLocals.authz_data.has_course_instance_permission_edit && (
        <>
          <UploadAssessmentGroupsModal
            csrfToken={resLocals.__csrf_token}
            show={showUploadAssessmentGroupsModal}
            onHide={() => setShowUploadAssessmentGroupsModal(false)}
          />
          <RandomAssessmentGroupsModal
            groupMin={groupConfigInfo.minimum ?? 2}
            groupMax={groupConfigInfo.maximum ?? 5}
            csrfToken={resLocals.__csrf_token}
            show={showRandomAssessmentGroupsModal}
            onHide={() => setShowRandomAssessmentGroupsModal(false)}
          />
          <AddGroupModal
            show={showAddGroupModal}
            onHide={() => setShowAddGroupModal(false)}
            onGroupAdded={(group, notAssigned) => {
              handleGroupAdded(group, notAssigned);
              setShowAddGroupModal(false);
            }}
          />
          <DeleteAllGroupsModal
            assessmentSetName={resLocals.assessment_set.name}
            assessmentNumber={resLocals.assessment.number}
            show={showDeleteAllGroupsModal}
            onHide={() => setShowDeleteAllGroupsModal(false)}
            onAllGroupsDeleted={(notAssigned) => {
              handleAllGroupsDeleted(notAssigned);
              setShowDeleteAllGroupsModal(false);
            }}
          />
        </>
      )}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
          <h1>
            {resLocals.assessment_set.name} {resLocals.assessment.number}: Groups
          </h1>
          {resLocals.authz_data.has_course_instance_permission_edit && (
            <div className="ms-auto d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={() => setShowAddGroupModal(true)}
              >
                <i className="fa fa-plus" aria-hidden="true" /> Add a group
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => setShowDeleteAllGroupsModal(true)}
              >
                <i className="fa fa-times" aria-hidden="true" /> Delete all groups
              </button>
            </div>
          )}
        </div>
        {resLocals.authz_data.has_course_instance_permission_edit && (
          <div className="container-fluid">
            <div className="row">
              <div className="col-sm bg-light py-4 border text-center">
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  onClick={() => setShowUploadAssessmentGroupsModal(true)}
                >
                  <i className="fas fa-upload" aria-hidden="true" /> Upload
                </button>
                <div className="mt-2">Upload a CSV file with group assignments.</div>
              </div>
              <div className="col-sm bg-light py-4 border text-center">
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  onClick={() => setShowRandomAssessmentGroupsModal(true)}
                >
                  <i className="fas fa-shuffle" aria-hidden="true" /> Random
                </button>
                <div className="mt-2">Randomly assign students to groups.</div>
              </div>
            </div>
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-sm table-hover" aria-label="Groups">
            <thead>
              <tr>
                <SortableHeader label="Name" sortKey="name" sort={sort} onSort={handleSort} />
                <SortableHeader label="Size" sortKey="size" sort={sort} onSort={handleSort} />
                <SortableHeader
                  label="Group Members (UIDs)"
                  sortKey="members"
                  sort={sort}
                  className="text-center"
                  onSort={handleSort}
                />
                {resLocals.authz_data.has_course_instance_permission_edit && <th />}
              </tr>
            </thead>
            <tbody>
              {sortedGroups?.map((row) => (
                <GroupRow
                  key={row.group_id}
                  row={row}
                  canEdit={resLocals.authz_data.has_course_instance_permission_edit}
                  onGroupUpdated={handleGroupUpdated}
                  onGroupDeleted={handleGroupDeleted}
                />
              ))}
            </tbody>
          </table>
          <div className="card-footer">
            <p>
              Download{' '}
              <a
                href={`${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads/${groupsCsvFilename}`}
              >
                {groupsCsvFilename}
              </a>
            </p>
            {!notAssigned || notAssigned.length === 0 ? (
              <small>
                <strong>All students have been assigned groups.</strong>
              </small>
            ) : (
              <>
                <small>
                  <strong>
                    {notAssigned.length} student{notAssigned.length > 1 ? 's' : ''} not yet
                    assigned:
                  </strong>
                </small>
                <ul className="mb-0">
                  {notAssigned.map((uid) => (
                    <li key={uid}>
                      <b>{uid}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AddMembersForm({
  row,
  onCancel,
  onMembersAdded,
}: {
  row: GroupUsersRow;
  onCancel: () => void;
  onMembersAdded: (group: GroupUsersRow, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.addMember.mutationOptions());
  const failures = mutation.data?.failures ?? [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ uids: string }>({ defaultValues: { uids: '' } });

  const onSubmit = (data: { uids: string }) => {
    mutation.mutate(
      { group_id: row.group_id, uids: data.uids },
      {
        onSuccess: ({ group, notAssigned, failures }) => {
          onMembersAdded(group, notAssigned);
          if (failures.length === 0) {
            reset();
            mutation.reset();
          }
        },
      },
    );
  };

  return (
    <form name="add-member-form" onSubmit={handleSubmit(onSubmit)}>
      {mutation.error && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {mutation.error.message}
        </Alert>
      )}
      {failures.length > 0 && (
        <Alert variant="warning" dismissible onClose={() => mutation.reset()}>
          <strong>Some users could not be added:</strong>
          <ul className="mb-0">
            {failures.map((f) => (
              <li key={f.uid}>
                {f.uid}: {f.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="mb-3">
        <label className="form-label" htmlFor="add_member_uids">
          UIDs
        </label>
        <input
          type="text"
          className={clsx('form-control', errors.uids && 'is-invalid')}
          placeholder="student@example.com"
          id="add_member_uids"
          aria-describedby="add_member_uids_help"
          aria-invalid={errors.uids ? 'true' : undefined}
          {...(errors.uids ? { 'aria-errormessage': 'add_member_uids_error' } : {})}
          defaultValue=""
          {...register('uids', { required: 'At least one UID is required.' })}
        />
        {errors.uids && (
          <div id="add_member_uids_error" className="invalid-feedback">
            {errors.uids.message}
          </div>
        )}
        <small id="add_member_uids_help" className="form-text text-muted">
          Separate multiple UIDs with commas.
        </small>
      </div>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || mutation.isPending}
        >
          Add
        </button>
      </div>
    </form>
  );
}

function DeleteGroupForm({
  row,
  onCancel,
  onGroupDeleted,
}: {
  row: GroupUsersRow;
  onCancel: () => void;
  onGroupDeleted: (groupId: string, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.deleteGroup.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['DeleteGroup']>(mutation.error);

  const submitDelete = () => {
    mutation.mutate(
      { group_id: row.group_id },
      {
        onSuccess: ({ notAssigned }) => {
          onGroupDeleted(row.group_id, notAssigned);
          mutation.reset();
        },
      },
    );
  };

  return (
    <form
      name="delete-group-form"
      onSubmit={(e) => {
        e.preventDefault();
        submitDelete();
      }}
    >
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
        </Alert>
      )}
      <p>
        Are you sure you want to delete the group <strong>{row.name}</strong>?
      </p>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" disabled={mutation.isPending}>
          Delete
        </button>
      </div>
    </form>
  );
}

function RemoveMembersForm({
  row,
  onCancel,
  onMemberRemoved,
}: {
  row: GroupUsersRow;
  onCancel: () => void;
  onMemberRemoved: (group: GroupUsersRow, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.deleteMember.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['DeleteMember']>(mutation.error);

  const firstUserId = row.users[0]?.id ?? '';

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ user_id: string }>({ defaultValues: { user_id: firstUserId } });

  const onSubmit = (data: { user_id: string }) => {
    mutation.mutate(
      { group_id: row.group_id, user_id: data.user_id },
      {
        onSuccess: ({ group, notAssigned }) => {
          onMemberRemoved(group, notAssigned);
          mutation.reset();
        },
      },
    );
  };

  const selectId = `delete-member-form-${row.group_id}`;

  return (
    <form name="delete-member-form" onSubmit={handleSubmit(onSubmit)}>
      {appError && (
        <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
          {appError.message}
        </Alert>
      )}
      <div className="mb-3">
        <label className="form-label" htmlFor={selectId}>
          UID:
        </label>
        <select
          className="form-select"
          id={selectId}
          defaultValue={firstUserId}
          {...register('user_id')}
        >
          {row.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.uid}
            </option>
          ))}
        </select>
      </div>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-danger"
          disabled={row.users.length === 0 || isSubmitting || mutation.isPending}
        >
          Remove
        </button>
      </div>
    </form>
  );
}

function UploadAssessmentGroupsModal({
  csrfToken,
  show,
  onHide,
}: {
  csrfToken: string;
  show: boolean;
  onHide: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST" encType="multipart/form-data">
        <Modal.Header>
          <Modal.Title>Upload new group assignments</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Upload a CSV file in the format of:</p>
          <code className="text-dark">
            group_name,uid
            <br />
            groupA,one@example.com
            <br />
            groupA,two@example.com
            <br />
            groupB,three@example.com
            <br />
            groupB,four@example.com
          </code>
          <p className="mt-3">
            The <code>group_name</code> column should be a unique identifier for each group. To
            change the grouping, link uids to the group name.
          </p>
          <div className="mb-3">
            <label className="form-label" htmlFor="uploadAssessmentGroupsFileInput">
              Choose CSV file
            </label>
            <input
              type="file"
              accept=".csv"
              name="file"
              className="form-control"
              id="uploadAssessmentGroupsFileInput"
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="upload_assessment_groups" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Upload
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function RandomAssessmentGroupsModal({
  groupMin,
  groupMax,
  csrfToken,
  show,
  onHide,
}: {
  groupMin: number;
  groupMax: number;
  csrfToken: string;
  show: boolean;
  onHide: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST">
        <Modal.Header>
          <Modal.Title>Random group assignments</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <label className="form-label" htmlFor="formMin">
              Min number of members in a group
            </label>
            <input
              type="number"
              min="1"
              defaultValue={groupMin}
              className="form-control"
              id="formMin"
              name="min_group_size"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="formMax">
              Max number of members in a group
            </label>
            <input
              type="number"
              min="1"
              defaultValue={groupMax}
              className="form-control"
              id="formMax"
              name="max_group_size"
              required
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="random_assessment_groups" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Group
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AddGroupModal({
  show,
  onHide,
  onGroupAdded,
}: {
  show: boolean;
  onHide: () => void;
  onGroupAdded: (group: GroupUsersRow, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.addGroup.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['AddGroup']>(mutation.error);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ group_name: string; uids: string }>({
    defaultValues: { group_name: '', uids: '' },
  });

  const onSubmit = (data: { group_name: string; uids: string }) => {
    mutation.mutate(data, {
      onSuccess: ({ group, notAssigned }) => {
        onGroupAdded(group, notAssigned);
        reset();
        mutation.reset();
      },
    });
  };

  const handleHide = () => {
    reset();
    mutation.reset();
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header>
          <Modal.Title>Add a group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          <div className="mb-3">
            <label className="form-label" htmlFor="formName">
              Group name
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.group_name && 'is-invalid')}
              id="formName"
              aria-describedby="addGroupNameHelp"
              aria-invalid={errors.group_name ? 'true' : undefined}
              {...(errors.group_name ? { 'aria-errormessage': 'addGroupNameError' } : {})}
              maxLength={30}
              defaultValue=""
              {...register('group_name', {
                pattern: {
                  value: /^[0-9a-zA-Z]*$/,
                  message: 'Only letters and numbers are allowed.',
                },
                maxLength: { value: 30, message: 'Use at most 30 characters.' },
              })}
            />
            {errors.group_name && (
              <div id="addGroupNameError" className="invalid-feedback">
                {errors.group_name.message}
              </div>
            )}
            <small id="addGroupNameHelp" className="form-text text-muted">
              Keep blank to use a default name. If provided, the name must be at most 30 characters
              long and may only contain letters and numbers.
            </small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="addGroupUids">
              UIDs
            </label>
            <input
              type="text"
              className={clsx('form-control', errors.uids && 'is-invalid')}
              id="addGroupUids"
              placeholder="student1@example.com, student2@example.com"
              aria-describedby="addGroupUidsHelp"
              aria-invalid={errors.uids ? 'true' : undefined}
              {...(errors.uids ? { 'aria-errormessage': 'addGroupUidsError' } : {})}
              defaultValue=""
              {...register('uids', { required: 'At least one UID is required.' })}
            />
            {errors.uids && (
              <div id="addGroupUidsError" className="invalid-feedback">
                {errors.uids.message}
              </div>
            )}
            <small id="addGroupUidsHelp" className="form-text text-muted">
              Separate multiple UIDs with commas.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || mutation.isPending}
          >
            Add
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function DeleteAllGroupsModal({
  assessmentSetName,
  assessmentNumber,
  show,
  onHide,
  onAllGroupsDeleted,
}: {
  assessmentSetName: string;
  assessmentNumber: string;
  show: boolean;
  onHide: () => void;
  onAllGroupsDeleted: (notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.deleteAll.mutationOptions());

  const handleHide = () => {
    mutation.reset();
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(undefined, {
            onSuccess: ({ notAssigned }) => {
              onAllGroupsDeleted(notAssigned);
              mutation.reset();
            },
          });
        }}
      >
        <Modal.Header>
          <Modal.Title>Delete all existing groups</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {mutation.error && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {mutation.error.message}
            </Alert>
          )}
          <p>
            Are you sure you want to delete all existing groups for{' '}
            <strong>
              {assessmentSetName} {assessmentNumber}
            </strong>
            ? This cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={mutation.isPending}>
            Delete all
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function GroupRow({
  row,
  canEdit,
  onGroupUpdated,
  onGroupDeleted,
}: {
  row: GroupUsersRow;
  canEdit: boolean;
  onGroupUpdated: (group: GroupUsersRow, notAssigned: string[]) => void;
  onGroupDeleted: (groupId: string, notAssigned: string[]) => void;
}) {
  type PopoverEnum = 'add' | 'remove' | 'delete' | null;
  const [showPopover, setShowPopover] = useState<PopoverEnum>(null);

  return (
    <tr>
      <td>{row.name}</td>
      <td className="text-center">{row.size}</td>
      <td className="text-center">
        <small>
          {row.users.length > 0 ? row.users.map((user) => user.uid).join(', ') : '(empty)'}
        </small>
      </td>

      {canEdit && (
        <td className="text-center">
          <Dropdown autoClose="outside">
            <Dropdown.Toggle className="btn-xs btn-ghost">Action</Dropdown.Toggle>

            <Dropdown.Menu popperConfig={{ strategy: 'fixed' }}>
              <OverlayTrigger
                trigger="click"
                placement="auto"
                show={showPopover === 'add'}
                popperConfig={{ strategy: 'fixed' }}
                popover={{
                  header: 'Add members',
                  body: (
                    <AddMembersForm
                      row={row}
                      onCancel={() => setShowPopover(null)}
                      onMembersAdded={(group, notAssigned) => {
                        onGroupUpdated(group, notAssigned);
                        setShowPopover(null);
                      }}
                    />
                  ),
                }}
                rootClose
                onToggle={(next) => setShowPopover(next ? 'add' : null)}
              >
                <Dropdown.Item as="button" onClick={() => setShowPopover('add')}>
                  <i className="fa fa-user-plus" /> Add members
                </Dropdown.Item>
              </OverlayTrigger>

              <OverlayTrigger
                trigger="click"
                placement="auto"
                show={showPopover === 'remove'}
                popperConfig={{ strategy: 'fixed' }}
                popover={{
                  header: 'Remove members',
                  body: (
                    <RemoveMembersForm
                      row={row}
                      onCancel={() => setShowPopover(null)}
                      onMemberRemoved={(group, notAssigned) => {
                        onGroupUpdated(group, notAssigned);
                        setShowPopover(null);
                      }}
                    />
                  ),
                }}
                rootClose
                onToggle={(next) => setShowPopover(next ? 'remove' : null)}
              >
                <Dropdown.Item
                  as="button"
                  disabled={row.users.length === 0}
                  onClick={() => setShowPopover('remove')}
                >
                  <i className="fa fa-user-minus" /> Remove members
                </Dropdown.Item>
              </OverlayTrigger>

              <OverlayTrigger
                trigger="click"
                placement="auto"
                show={showPopover === 'delete'}
                popperConfig={{ strategy: 'fixed' }}
                popover={{
                  header: 'Delete group',
                  body: (
                    <DeleteGroupForm
                      row={row}
                      onCancel={() => setShowPopover(null)}
                      onGroupDeleted={(groupId, notAssigned) => {
                        onGroupDeleted(groupId, notAssigned);
                        setShowPopover(null);
                      }}
                    />
                  ),
                }}
                rootClose
                onToggle={(next) => setShowPopover(next ? 'delete' : null)}
              >
                <Dropdown.Item as="button" onClick={() => setShowPopover('delete')}>
                  <i className="fa fa-times" /> Delete group
                </Dropdown.Item>
              </OverlayTrigger>
            </Dropdown.Menu>
          </Dropdown>
        </td>
      )}
    </tr>
  );
}
