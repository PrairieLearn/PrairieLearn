import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistance } from 'date-fns';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Dropdown,
  DropdownButton,
  Modal,
  Spinner,
} from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { useModalState } from '@prairielearn/ui';

import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import type { StaffAssessment, StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';
import {
  getAssessmentDownloadUrl,
  getCourseInstanceJobSequenceUrl,
} from '../../../lib/client/url.js';
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
      { groupId: row.group_id, uids: data.uids },
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
              readOnly
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
            { groupId: row.group_id },
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
  minGroupSize,
  maxGroupSize,
  courseInstanceId,
  show,
  onHide,
}: {
  minGroupSize: number;
  maxGroupSize: number;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.randomizeGroups.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['RandomizeGroups']>(mutation.error);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting, errors, isValid },
  } = useForm<{ minGroupSize: number; maxGroupSize: number }>({
    mode: 'onChange',
    values: { minGroupSize, maxGroupSize },
  });

  const onSubmit = (data: { minGroupSize: number; maxGroupSize: number }) => {
    mutation.mutate(data, {
      onSuccess: ({ jobSequenceId }) => {
        window.location.href = getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId);
      },
    });
  };

  const handleHide = () => {
    reset({ minGroupSize, maxGroupSize });
    mutation.reset();
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header>
          <Modal.Title>Assign students randomly</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={appError}
            render={{
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => mutation.reset()}
          />
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
                className={clsx('form-control', errors.minGroupSize && 'is-invalid')}
                id="formMin"
                defaultValue={minGroupSize}
                aria-invalid={errors.minGroupSize ? 'true' : undefined}
                aria-errormessage={errors.minGroupSize ? 'formMinError' : undefined}
                {...register('minGroupSize', {
                  valueAsNumber: true,
                  required: 'Required.',
                  min: { value: 1, message: 'Must be at least 1.' },
                  deps: ['maxGroupSize'],
                  validate: (value) => {
                    const max = getValues('maxGroupSize');
                    if (Number.isFinite(value) && Number.isFinite(max) && value > max) {
                      return 'Must be ≤ max members.';
                    }
                    return true;
                  },
                })}
              />
              {errors.minGroupSize && (
                <div id="formMinError" className="text-danger small">
                  {errors.minGroupSize.message}
                </div>
              )}
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="formMax">
                Max members
              </label>
              <input
                type="number"
                className={clsx('form-control', errors.maxGroupSize && 'is-invalid')}
                id="formMax"
                defaultValue={maxGroupSize}
                aria-invalid={errors.maxGroupSize ? 'true' : undefined}
                aria-errormessage={errors.maxGroupSize ? 'formMaxError' : undefined}
                {...register('maxGroupSize', {
                  valueAsNumber: true,
                  required: 'Required.',
                  min: { value: 1, message: 'Must be at least 1.' },
                  deps: ['minGroupSize'],
                  validate: (value) => {
                    const min = getValues('minGroupSize');
                    if (Number.isFinite(value) && Number.isFinite(min) && value < min) {
                      return 'Must be ≥ min members.';
                    }
                    return true;
                  },
                })}
              />
              {errors.maxGroupSize && (
                <div id="formMaxError" className="text-danger small">
                  {errors.maxGroupSize.message}
                </div>
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={handleHide}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isValid || isSubmitting || mutation.isPending}
          >
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
  } = useForm<{ groupName: string; uids: string }>({
    defaultValues: { groupName: '', uids: '' },
  });

  const onSubmit = (data: { groupName: string; uids: string }) => {
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
              className={clsx('form-control', errors.groupName && 'is-invalid')}
              id="formName"
              aria-describedby="addGroupNameHelp"
              aria-invalid={errors.groupName ? 'true' : undefined}
              {...(errors.groupName ? { 'aria-errormessage': 'addGroupNameError' } : {})}
              maxLength={30}
              defaultValue=""
              {...register('groupName', {
                pattern: {
                  value: /^[0-9a-zA-Z]*$/,
                  message: 'Only letters and numbers are allowed.',
                },
                maxLength: { value: 30, message: 'Use at most 30 characters.' },
              })}
            />
            {errors.groupName && (
              <div id="addGroupNameError" className="invalid-feedback">
                {errors.groupName.message}
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
  const appError = getAppError<AssessmentGroupsError['DeleteAll']>(mutation.error);

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
  courseInstanceId,
  csrfToken,
  canEdit,
  editUnavailableReason,
  minGroupSize,
  maxGroupSize,
}: {
  groupsCsvFilename?: string;
  initialGroups?: GroupUsersRow[];
  initialNotAssigned?: string[];
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  courseInstanceId: string;
  csrfToken: string;
  canEdit: boolean;
  editUnavailableReason?: string;
  minGroupSize: number;
  maxGroupSize: number;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [notAssigned, setNotAssigned] = useState(initialNotAssigned);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const trpc = useTRPC();
  const refreshMutation = useMutation(
    trpc.assessmentGroups.refreshGroups.mutationOptions({
      onSuccess: ({ groups: newGroups, notAssigned: newNotAssigned }) => {
        const refreshedAt = Date.now();
        setGroups(newGroups);
        setNotAssigned(newNotAssigned);
        setLastRefreshedAt(refreshedAt);
        setNow(refreshedAt);
      },
    }),
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const uploadModal = useModalState<null>();
  const randomModal = useModalState<null>();
  const addModal = useModalState<null>();
  const deleteAllModal = useModalState<null>();
  const editModal = useModalState<GroupUsersRow>();
  const deleteModal = useModalState<GroupUsersRow>();

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
            show={uploadModal.show}
            onHide={uploadModal.hide}
          />
          <RandomAssessmentGroupsModal
            minGroupSize={minGroupSize}
            maxGroupSize={maxGroupSize}
            courseInstanceId={courseInstanceId}
            show={randomModal.show}
            onHide={randomModal.hide}
          />
          <AddGroupModal
            show={addModal.show}
            onHide={addModal.hide}
            onGroupAdded={(group, notAssigned) => {
              handleGroupAdded(group, notAssigned);
              addModal.hide();
            }}
          />
          <DeleteAllGroupsModal
            assessmentSetName={assessmentSet.name}
            assessmentNumber={assessment.number}
            show={deleteAllModal.show}
            onHide={deleteAllModal.hide}
            onAllGroupsDeleted={(notAssigned) => {
              handleAllGroupsDeleted(notAssigned);
              deleteAllModal.hide();
            }}
          />
          {editModal.data && (
            <EditGroupModal
              key={editModal.data.group_id}
              row={editModal.data}
              show={editModal.show}
              onHide={editModal.hide}
              onGroupEdited={handleGroupUpdated}
            />
          )}
          {deleteModal.data && (
            <DeleteGroupModal
              key={deleteModal.data.group_id}
              row={deleteModal.data}
              show={deleteModal.show}
              onHide={deleteModal.hide}
              onGroupDeleted={(groupId, newNotAssigned) => {
                handleGroupDeleted(groupId, newNotAssigned);
                deleteModal.hide();
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
                  const totalStudents = unassignedCount + assignedCount;
                  if (totalStudents === 0) return 'No students enrolled';
                  if (unassignedCount === 0) return 'All students are assigned';
                  if (assignedCount === 0) {
                    return `${unassignedCount} student${unassignedCount === 1 ? '' : 's'} unassigned`;
                  }
                  return `${assignedCount} assigned · ${unassignedCount} unassigned`;
                })}
                {' · Updated '}
                {formatDistance(lastRefreshedAt, now, { addSuffix: true })}
              </div>
            </div>
            <div className="d-flex gap-2">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => addModal.showWithData(null)}
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" /> Add group
                </button>
              )}
              <DropdownButton as={ButtonGroup} title="Actions" variant="outline-secondary">
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={!canEdit}
                  onClick={() => uploadModal.showWithData(null)}
                >
                  <i className="bi bi-upload me-2" aria-hidden="true" />
                  Import CSV
                </Dropdown.Item>
                <Dropdown.Item
                  as="a"
                  href={getAssessmentDownloadUrl({
                    courseInstanceId,
                    assessmentId: assessment.id,
                    filename: groupsCsvFilename ?? '',
                  })}
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
                  onClick={() => deleteAllModal.showWithData(null)}
                >
                  <i className="bi bi-trash me-2" aria-hidden="true" />
                  Delete all
                </Dropdown.Item>
              </DropdownButton>
              <Button
                variant="outline-secondary"
                aria-label="Refresh groups"
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate()}
              >
                {refreshMutation.isPending ? (
                  <Spinner as="span" size="sm" animation="border" aria-hidden="true" />
                ) : (
                  <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          {!canEdit && editUnavailableReason && (
            <Alert variant="info" className="mb-3">
              {editUnavailableReason}
            </Alert>
          )}

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
                  onClick={() => randomModal.showWithData(null)}
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
                {groups && groups.length > 0 ? (
                  groups.map((row) => (
                    <GroupRow
                      key={row.group_id}
                      row={row}
                      canEdit={canEdit}
                      onEdit={editModal.showWithData}
                      onDelete={deleteModal.showWithData}
                    />
                  ))
                ) : (
                  <tr className="text-center text-muted">
                    <td colSpan={canEdit ? 4 : 3} className="py-4">
                      <i className="bi bi-people me-2" aria-hidden="true" />
                      No groups created
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
