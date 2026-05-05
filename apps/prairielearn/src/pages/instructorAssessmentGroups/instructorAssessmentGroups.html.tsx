import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { getAppError } from '../../lib/client/errors.js';
import type { PageContext } from '../../lib/client/page-context.js';
import { type StaffGroupConfig } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
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
  pageContext: PageContext<'assessment', 'instructor'>;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

export function InstructorAssessmentGroups({
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  pageContext,
  trpcCsrfToken,
  isDevMode,
}: InstructorAssessmentGroupsProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: pageContext.course_instance.id,
      assessmentId: pageContext.assessment.id,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentGroupsInner
          groupsCsvFilename={groupsCsvFilename}
          groupConfigInfo={groupConfigInfo}
          groups={groups}
          notAssigned={notAssigned}
          pageContext={pageContext}
        />
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
  pageContext,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const [showUploadAssessmentGroupsModal, setShowUploadAssessmentGroupsModal] = useState(false);
  const [showRandomAssessmentGroupsModal, setShowRandomAssessmentGroupsModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showDeleteAllGroupsModal, setShowDeleteAllGroupsModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupUsersRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupUsersRow | null>(null);
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
            {pageContext.assessment_set.name} {pageContext.assessment.number}: Groups
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
      {pageContext.authz_data.has_course_instance_permission_edit && (
        <>
          <UploadAssessmentGroupsModal
            csrfToken={pageContext.__csrf_token}
            show={showUploadAssessmentGroupsModal}
            onHide={() => setShowUploadAssessmentGroupsModal(false)}
          />
          <RandomAssessmentGroupsModal
            groupMin={groupConfigInfo.minimum ?? 2}
            groupMax={groupConfigInfo.maximum ?? 5}
            csrfToken={pageContext.__csrf_token}
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
            assessmentSetName={pageContext.assessment_set.name}
            assessmentNumber={pageContext.assessment.number}
            show={showDeleteAllGroupsModal}
            onHide={() => setShowDeleteAllGroupsModal(false)}
            onAllGroupsDeleted={(notAssigned) => {
              handleAllGroupsDeleted(notAssigned);
              setShowDeleteAllGroupsModal(false);
            }}
          />
          {editingGroup && (
            <EditGroupModal
              key={editingGroup.group_id}
              row={editingGroup}
              show
              onHide={() => setEditingGroup(null)}
              onGroupEdited={handleGroupUpdated}
            />
          )}
          {deletingGroup && (
            <DeleteGroupModal
              key={deletingGroup.group_id}
              row={deletingGroup}
              show
              onHide={() => setDeletingGroup(null)}
              onGroupDeleted={(groupId, newNotAssigned) => {
                handleGroupDeleted(groupId, newNotAssigned);
                setDeletingGroup(null);
              }}
            />
          )}
        </>
      )}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
          <h1>
            {pageContext.assessment_set.name} {pageContext.assessment.number}: Groups
          </h1>
          {pageContext.authz_data.has_course_instance_permission_edit && (
            <div className="ms-auto d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={() => setShowAddGroupModal(true)}
              >
                <i className="bi bi-plus-lg" aria-hidden="true" /> Add a group
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => setShowDeleteAllGroupsModal(true)}
              >
                <i className="bi bi-x-lg" aria-hidden="true" /> Delete all groups
              </button>
            </div>
          )}
        </div>
        {pageContext.authz_data.has_course_instance_permission_edit && (
          <div className="container-fluid">
            <div className="row">
              <div className="col-sm bg-light py-4 border text-center">
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  onClick={() => setShowUploadAssessmentGroupsModal(true)}
                >
                  <i className="bi bi-upload" aria-hidden="true" /> Upload
                </button>
                <div className="mt-2">Upload a CSV file with group assignments.</div>
              </div>
              <div className="col-sm bg-light py-4 border text-center">
                <button
                  type="button"
                  className="btn btn-primary text-nowrap"
                  onClick={() => setShowRandomAssessmentGroupsModal(true)}
                >
                  <i className="bi bi-shuffle" aria-hidden="true" /> Random
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
                {pageContext.authz_data.has_course_instance_permission_edit && <th />}
              </tr>
            </thead>
            <tbody>
              {sortedGroups?.map((row) => (
                <GroupRow
                  key={row.group_id}
                  row={row}
                  canEdit={pageContext.authz_data.has_course_instance_permission_edit}
                  onEdit={setEditingGroup}
                  onDelete={setDeletingGroup}
                />
              ))}
            </tbody>
          </table>
          <div className="card-footer">
            <p>
              Download{' '}
              <a
                href={`${pageContext.urlPrefix}/assessment/${pageContext.assessment.id}/downloads/${groupsCsvFilename}`}
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

function EditGroupModal({
  row,
  show,
  onHide,
  onGroupEdited,
}: {
  row: GroupUsersRow;
  show: boolean;
  onHide: () => void;
  onGroupEdited: (group: GroupUsersRow, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.editGroup.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['EditGroup']>(mutation.error);
  const failures = mutation.data?.failures ?? [];

  const currentUids = row.users.map((u) => u.uid).join(', ');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ uids: string }>({ values: { uids: currentUids } });

  const onSubmit = (data: { uids: string }) => {
    mutation.mutate(
      { group_id: row.group_id, uids: data.uids },
      {
        onSuccess: ({ group, notAssigned, failures }) => {
          onGroupEdited(group, notAssigned);
          if (failures.length === 0) {
            reset();
            mutation.reset();
            onHide();
          }
        },
      },
    );
  };

  const handleHide = () => {
    reset();
    mutation.reset();
    onHide();
  };

  const uidsInputId = `editGroupUids-${row.group_id}`;
  const uidsErrorId = `editGroupUidsError-${row.group_id}`;

  return (
    <Modal show={show} onHide={handleHide}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header>
          <Modal.Title>Edit group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          {failures.length > 0 && (
            <Alert variant="warning" dismissible onClose={() => mutation.reset()}>
              <strong>Some changes could not be applied:</strong>
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
            <label className="form-label" htmlFor={`editGroupName-${row.group_id}`}>
              Group name
            </label>
            <input
              type="text"
              className="form-control"
              id={`editGroupName-${row.group_id}`}
              value={row.name}
              disabled
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor={uidsInputId}>
              UIDs
            </label>
            <textarea
              className={clsx('form-control', errors.uids && 'is-invalid')}
              id={uidsInputId}
              rows={5}
              placeholder="student1@example.com, student2@example.com"
              aria-invalid={errors.uids ? 'true' : undefined}
              {...(errors.uids ? { 'aria-errormessage': uidsErrorId } : {})}
              defaultValue={currentUids}
              {...register('uids')}
            />
            {errors.uids && (
              <div id={uidsErrorId} className="invalid-feedback">
                {errors.uids.message}
              </div>
            )}
            <small className="form-text text-muted">
              Separate multiple UIDs with commas. This list replaces the current members.
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
            Save
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function DeleteGroupModal({
  row,
  show,
  onHide,
  onGroupDeleted,
}: {
  row: GroupUsersRow;
  show: boolean;
  onHide: () => void;
  onGroupDeleted: (groupId: string, notAssigned: string[]) => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.deleteGroup.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['DeleteGroup']>(mutation.error);

  const handleHide = () => {
    mutation.reset();
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(
            { group_id: row.group_id },
            {
              onSuccess: ({ notAssigned }) => {
                onGroupDeleted(row.group_id, notAssigned);
                mutation.reset();
              },
            },
          );
        }}
      >
        <Modal.Header>
          <Modal.Title>Delete group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the group <strong>{row.name}</strong>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={mutation.isPending}>
            Delete
          </button>
        </Modal.Footer>
      </form>
    </Modal>
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
            <textarea
              className={clsx('form-control', errors.uids && 'is-invalid')}
              id="addGroupUids"
              rows={5}
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
  const appError = getAppError<Record<string, never>>(mutation.error);

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
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
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
  onEdit,
  onDelete,
}: {
  row: GroupUsersRow;
  canEdit: boolean;
  onEdit: (row: GroupUsersRow) => void;
  onDelete: (row: GroupUsersRow) => void;
}) {
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
          <div className="d-flex justify-content-center gap-2">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onEdit(row)}>
              <i className="bi bi-pencil" aria-hidden="true" /> Edit
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(row)}>
              <i className="bi bi-trash" aria-hidden="true" /> Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
