import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, ButtonGroup, Dropdown, DropdownButton, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { getAppError } from '../../../lib/client/errors.js';
import type { StaffAssessment, StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';
import type { GroupUsersRow } from '../../../models/group.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

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
  const { register, reset } = useForm<{ min_group_size: number; max_group_size: number }>({
    values: { min_group_size: groupMin, max_group_size: groupMax },
  });

  const handleHide = () => {
    reset({ min_group_size: groupMin, max_group_size: groupMax });
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide}>
      <form method="POST">
        <Modal.Header>
          <Modal.Title>Assign students randomly</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Unassigned students will be randomly distributed into new groups based on the size
            constraints below. Students already in a group will not be affected.
          </p>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label" htmlFor="formMin">
                Min members
              </label>
              <input
                type="number"
                min="1"
                className="form-control"
                id="formMin"
                defaultValue={groupMin}
                required
                {...register('min_group_size', { valueAsNumber: true })}
              />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="formMax">
                Max members
              </label>
              <input
                type="number"
                min="1"
                className="form-control"
                id="formMax"
                defaultValue={groupMax}
                required
                {...register('max_group_size', { valueAsNumber: true })}
              />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="random_assessment_groups" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Assign
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
      <td className="pe-3 text-nowrap">{row.name}</td>
      <td className="pe-3 text-nowrap">
        <i className="bi bi-people text-muted me-1" aria-hidden="true" />
        {row.size}
      </td>
      <td>
        {row.users.length > 0 ? (
          <div className="d-flex flex-wrap gap-1">
            {row.users.map((user) => (
              <span key={user.id} className="badge rounded-pill bg-light text-dark border">
                {user.uid}
              </span>
            ))}
          </div>
        ) : (
          <small className="text-muted">(empty)</small>
        )}
      </td>

      {canEdit && (
        <td className="text-end">
          <div className="d-inline-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              aria-label={`Edit ${row.name}`}
              onClick={() => onEdit(row)}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              aria-label={`Delete ${row.name}`}
              onClick={() => onDelete(row)}
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export function GroupsCard({
  groupsCsvFilename,
  initialGroups,
  initialNotAssigned,
  assessment,
  assessmentSet,
  urlPrefix,
  csrfToken,
  canEdit,
  groupMin,
  groupMax,
}: {
  groupsCsvFilename?: string;
  initialGroups?: GroupUsersRow[];
  initialNotAssigned?: string[];
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  urlPrefix: string;
  csrfToken: string;
  canEdit: boolean;
  groupMin: number;
  groupMax: number;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [notAssigned, setNotAssigned] = useState(initialNotAssigned);
  const [showUploadAssessmentGroupsModal, setShowUploadAssessmentGroupsModal] = useState(false);
  const [showRandomAssessmentGroupsModal, setShowRandomAssessmentGroupsModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showDeleteAllGroupsModal, setShowDeleteAllGroupsModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupUsersRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupUsersRow | null>(null);

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

  return (
    <>
      {canEdit && (
        <>
          <UploadAssessmentGroupsModal
            csrfToken={csrfToken}
            show={showUploadAssessmentGroupsModal}
            onHide={() => setShowUploadAssessmentGroupsModal(false)}
          />
          <RandomAssessmentGroupsModal
            groupMin={groupMin}
            groupMax={groupMax}
            csrfToken={csrfToken}
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
            assessmentSetName={assessmentSet.name}
            assessmentNumber={assessment.number}
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
      <div className="card">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-md-start gap-3 mb-3">
            <div>
              <h5 className="mb-1">Groups</h5>
              <div className="text-muted small">
                {groups?.length ?? 0} group{(groups?.length ?? 0) === 1 ? '' : 's'}
                {' · '}
                {run(() => {
                  const unassignedCount = notAssigned?.length ?? 0;
                  const assignedCount = groups?.reduce((sum, g) => sum + g.size, 0) ?? 0;
                  if (unassignedCount === 0) return 'All students are assigned';
                  if (assignedCount === 0) {
                    return `${unassignedCount} student${unassignedCount === 1 ? '' : 's'} unassigned`;
                  }
                  return `${assignedCount} assigned · ${unassignedCount} unassigned`;
                })}
              </div>
            </div>
            <div className="d-flex gap-2">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => setShowAddGroupModal(true)}
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" /> Add group
                </button>
              )}
              <DropdownButton as={ButtonGroup} title="Actions" variant="light">
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setShowUploadAssessmentGroupsModal(true)}
                >
                  <i className="bi bi-upload me-2" aria-hidden="true" />
                  Import CSV
                </Dropdown.Item>
                <Dropdown.Item
                  as="a"
                  href={`${urlPrefix}/assessment/${assessment.id}/downloads/${groupsCsvFilename}`}
                >
                  <i className="bi bi-download me-2" aria-hidden="true" />
                  Export CSV
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={!canEdit}
                  className="text-danger"
                  onClick={() => setShowDeleteAllGroupsModal(true)}
                >
                  <i className="bi bi-trash me-2" aria-hidden="true" />
                  Delete all
                </Dropdown.Item>
              </DropdownButton>
            </div>
          </div>

          {notAssigned && notAssigned.length > 0 && (
            <Alert
              variant="warning"
              className="d-flex flex-column flex-md-row justify-content-md-between align-items-md-baseline gap-3"
            >
              <div className="flex-grow-1">
                <details>
                  <summary className="fw-semibold">
                    {notAssigned.length} student{notAssigned.length === 1 ? '' : 's'} not assigned
                    to a group
                  </summary>
                  <ul className="mb-0 mt-2 small">
                    {notAssigned.map((uid) => (
                      <li key={uid}>{uid}</li>
                    ))}
                  </ul>
                </details>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-secondary text-nowrap"
                  onClick={() => setShowRandomAssessmentGroupsModal(true)}
                >
                  <i className="bi bi-shuffle" aria-hidden="true" /> Assign randomly
                </button>
              )}
            </Alert>
          )}

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" aria-label="Groups">
              <thead>
                <tr>
                  <th className="pe-3 text-nowrap">Name</th>
                  <th className="pe-3 text-nowrap">Size</th>
                  <th>Members</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {groups?.map((row) => (
                  <GroupRow
                    key={row.group_id}
                    row={row}
                    canEdit={canEdit}
                    onEdit={setEditingGroup}
                    onDelete={setDeletingGroup}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
