import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Alert, ButtonGroup, Dropdown, DropdownButton, Modal } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { getAppError } from '../../lib/client/errors.js';
import { type StaffGroupConfig } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { type GroupSettingsFormValues, makeRole } from '../../lib/group-config.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { GroupUsersRow } from '../../models/group.js';
import type { AssessmentGroupsError } from '../../trpc/assessment/assessment-groups.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

function NoGroupConfigCard({
  origHash,
  onEnable,
}: {
  origHash: string | null;
  onEnable: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.enableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['EnableGroupWork']>(mutation.error);

  return (
    <div className="container py-3">
      <div className="card">
        <div className="card-body text-center">
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          <i className="bi bi-people fs-1 mb-2" />
          <h2 className="h5">This is not a group assessment.</h2>
          <div className="text-muted">
            Enable group work to allow students to collaborate and submit as teams.
          </div>
          <button
            type="button"
            className="btn btn-outline-primary mt-3"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ origHash }, { onSuccess: () => onEnable() })}
          >
            Enable group work
          </button>
        </div>
      </div>
    </div>
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
  origHash: string | null;
  groupSettingsDefaults: GroupSettingsFormValues | null;
}

export function InstructorAssessmentGroups({
  groupsCsvFilename,
  groupConfigInfo,
  groups,
  notAssigned,
  resLocals,
  trpcCsrfToken,
  isDevMode,
  origHash,
  groupSettingsDefaults,
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
        <InstructorAssessmentGroupsInner
          groupsCsvFilename={groupsCsvFilename}
          groupConfigInfo={groupConfigInfo}
          groups={groups}
          notAssigned={notAssigned}
          resLocals={resLocals}
          origHash={origHash}
          groupSettingsDefaults={groupSettingsDefaults}
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
  resLocals,
  origHash: initialOrigHash,
  groupSettingsDefaults,
}: Omit<InstructorAssessmentGroupsProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const [showUploadAssessmentGroupsModal, setShowUploadAssessmentGroupsModal] = useState(false);
  const [showRandomAssessmentGroupsModal, setShowRandomAssessmentGroupsModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showDeleteAllGroupsModal, setShowDeleteAllGroupsModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupUsersRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupUsersRow | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [notAssigned, setNotAssigned] = useState(initialNotAssigned);
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [groupMin, setGroupMin] = useState(
    groupSettingsDefaults?.minMembers ?? groupConfigInfo?.minimum ?? 2,
  );
  const [groupMax, setGroupMax] = useState(
    groupSettingsDefaults?.maxMembers ?? groupConfigInfo?.maximum ?? 4,
  );

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

  if (!groupConfigInfo) {
    return <NoGroupConfigCard origHash={origHash} onEnable={() => window.location.reload()} />;
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
            groupMin={groupMin}
            groupMax={groupMax}
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
      <div className="container d-flex flex-column gap-3">
        <GroupSettingsCard
          groupConfigInfo={groupConfigInfo}
          groupSettingsDefaults={groupSettingsDefaults}
          origHash={origHash}
          onOrigHashChange={setOrigHash}
          onGroupSizeSaved={(min, max) => {
            if (min != null) setGroupMin(min);
            if (max != null) setGroupMax(max);
          }}
        />
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
                {resLocals.authz_data.has_course_instance_permission_edit && (
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
                    disabled={!resLocals.authz_data.has_course_instance_permission_edit}
                    onClick={() => setShowUploadAssessmentGroupsModal(true)}
                  >
                    <i className="bi bi-upload me-2" aria-hidden="true" />
                    Import CSV
                  </Dropdown.Item>
                  <Dropdown.Item
                    as="a"
                    href={`${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads/${groupsCsvFilename}`}
                  >
                    <i className="bi bi-download me-2" aria-hidden="true" />
                    Export CSV
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    as="button"
                    type="button"
                    disabled={!resLocals.authz_data.has_course_instance_permission_edit}
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
                {resLocals.authz_data.has_course_instance_permission_edit && (
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
                    {resLocals.authz_data.has_course_instance_permission_edit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {groups?.map((row) => (
                    <GroupRow
                      key={row.group_id}
                      row={row}
                      canEdit={resLocals.authz_data.has_course_instance_permission_edit}
                      onEdit={setEditingGroup}
                      onDelete={setDeletingGroup}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const RECOMMENDED_ROLES: GroupSettingsFormValues['roles'] = [
  makeRole({ name: 'Manager', minAssignees: 1, maxAssignees: 1, canAssignRoles: true }),
  makeRole({ name: 'Recorder', minAssignees: 1, maxAssignees: 1 }),
  makeRole({ name: 'Reflector', minAssignees: 1, maxAssignees: 1 }),
  makeRole({ name: 'Contributor' }),
];

function ApplyRecommendedRolesModal({
  show,
  onHide,
  onApply,
}: {
  show: boolean;
  onHide: () => void;
  onApply: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header>
        <Modal.Title>Apply recommended roles</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          Adds four roles inspired by{' '}
          <a href="https://pogil.org/what-is-pogil" target="_blank" rel="noreferrer">
            POGIL
          </a>
          . You can edit them before saving.
        </p>
        <ul className="mb-0">
          <li>
            <strong>Manager</strong> — 1 assignee, can assign roles to teammates.
          </li>
          <li>
            <strong>Recorder</strong> — 1 assignee.
          </li>
          <li>
            <strong>Reflector</strong> — 1 assignee.
          </li>
          <li>
            <strong>Contributor</strong> — unlimited assignees.
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onApply}>
          Apply
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function GroupSettingsCard({
  groupConfigInfo,
  groupSettingsDefaults,
  origHash,
  onOrigHashChange,
  onGroupSizeSaved,
}: {
  groupConfigInfo: StaffGroupConfig;
  groupSettingsDefaults: GroupSettingsFormValues | null;
  origHash: string | null;
  onOrigHashChange: (hash: string | null) => void;
  onGroupSizeSaved: (min: number | null, max: number | null) => void;
}) {
  const [showRecommendedRolesModal, setShowRecommendedRolesModal] = useState(false);
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.updateGroupConfig.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['UpdateGroupConfig']>(mutation.error);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { isDirty, isValid, errors },
  } = useForm<GroupSettingsFormValues>({
    mode: 'onChange',
    defaultValues: groupSettingsDefaults ?? {
      studentPermissions: {
        canCreateGroup: false,
        canJoinGroup: false,
        canLeaveGroup: false,
        canNameGroup: true,
      },
      minMembers: groupConfigInfo.minimum ?? null,
      maxMembers: groupConfigInfo.maximum ?? null,
      roles: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'roles' });

  const watchedMin = watch('minMembers');
  const watchedMax = watch('maxMembers');
  const watchedRoles = watch('roles');

  const groupSizeError = run(() => {
    if (watchedMin != null && watchedMax != null && watchedMin > watchedMax) {
      return 'Minimum members cannot be greater than maximum members.';
    }
    return null;
  });
  const roleErrors = run(() => {
    if (watchedRoles.length === 0) return [];
    const errors: string[] = [];
    const hasAssigner = watchedRoles.some(
      (role) => role.canAssignRoles && (role.minAssignees ?? 0) >= 1,
    );
    if (!hasAssigner) {
      errors.push(
        'When custom roles are defined, at least one role with "Can assign roles" enabled must have a minimum of 1 member.',
      );
    }
    if (!watchedRoles.some((r) => r.canView)) {
      errors.push('At least one role must be able to view questions.');
    }
    if (!watchedRoles.some((r) => r.canSubmit)) {
      errors.push('At least one role must be able to submit answers.');
    }
    for (const r of watchedRoles) {
      const name = r.name || '(unnamed)';
      if (!r.canView && !r.canSubmit && !r.canAssignRoles) {
        errors.push(
          `"${name}" has no permissions — students with this role won't be able to view, submit, or assign roles.`,
        );
      }
      if (watchedMax != null && r.minAssignees != null && r.minAssignees > watchedMax) {
        errors.push(
          `Role "${name}" has a minimum (${r.minAssignees}) greater than the group's maximum (${watchedMax}).`,
        );
      }
      if (watchedMax != null && r.maxAssignees != null && r.maxAssignees > watchedMax) {
        errors.push(
          `Role "${name}" has a maximum (${r.maxAssignees}) greater than the group's maximum (${watchedMax}).`,
        );
      }
    }
    return errors;
  });
  const roleWarnings = run(() => {
    if (watchedRoles.length === 0) return [];
    const warnings: string[] = [];
    for (const r of watchedRoles) {
      const name = r.name || '(unnamed)';
      if (watchedMin != null && r.minAssignees != null && r.minAssignees > watchedMin) {
        warnings.push(
          `Role "${name}" has a minimum (${r.minAssignees}) greater than the group's minimum (${watchedMin}).`,
        );
      }
      if (r.origName != null && r.name.trim() !== '' && r.origName !== r.name) {
        warnings.push(
          `Role "${r.origName}" will be renamed to "${r.name}". All zone and question permission references will be updated automatically.`,
        );
      }
    }
    return warnings;
  });

  const onSubmit = (data: GroupSettingsFormValues) => {
    const nanToNull = (v: number | null) => (v != null && Number.isNaN(v) ? null : v);
    mutation.mutate(
      {
        origHash,
        canCreateGroup: data.studentPermissions.canCreateGroup,
        canJoinGroup: data.studentPermissions.canJoinGroup,
        canLeaveGroup: data.studentPermissions.canLeaveGroup,
        canNameGroup: data.studentPermissions.canNameGroup,
        minMembers: nanToNull(data.minMembers),
        maxMembers: nanToNull(data.maxMembers),
        roles: data.roles.map((r) => ({
          ...r,
          minAssignees: nanToNull(r.minAssignees),
          maxAssignees: nanToNull(r.maxAssignees),
        })),
      },
      {
        onSuccess: ({ origHash: newHash }) => {
          onOrigHashChange(newHash);
          onGroupSizeSaved(nanToNull(data.minMembers), nanToNull(data.maxMembers));
          reset({
            ...data,
            roles: data.roles.map((r) => ({ ...r, origName: r.name })),
          });
        },
      },
    );
  };

  return (
    <div className="card">
      <ApplyRecommendedRolesModal
        show={showRecommendedRolesModal}
        onHide={() => setShowRecommendedRolesModal(false)}
        onApply={() => {
          append(RECOMMENDED_ROLES);
          setShowRecommendedRolesModal(false);
        }}
      />
      <div className="card-body">
        <h5 className="mb-1">Group settings</h5>
        <div className="text-muted small mb-4">Configure how groups work for this assessment.</div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {appError && (
            <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
              {appError.message}
            </Alert>
          )}
          {mutation.isSuccess && !isDirty && (
            <Alert variant="success" dismissible onClose={() => mutation.reset()}>
              Group configuration saved.
            </Alert>
          )}
          <div className="mb-4">
            <h6>Student permissions</h6>

            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                id="studentPermissions-canCreateGroup"
                {...register('studentPermissions.canCreateGroup')}
              />
              <label htmlFor="studentPermissions-canCreateGroup" className="form-check-label">
                Can create group
              </label>
              <div className="text-muted small">Allow students to create groups.</div>
            </div>

            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                id="studentPermissions-canJoinGroup"
                {...register('studentPermissions.canJoinGroup')}
              />
              <label htmlFor="studentPermissions-canJoinGroup" className="form-check-label">
                Can join group
              </label>
              <div className="text-muted small">
                Allow students to join other groups by join code.
              </div>
            </div>

            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                id="studentPermissions-canLeaveGroup"
                {...register('studentPermissions.canLeaveGroup')}
              />
              <label htmlFor="studentPermissions-canLeaveGroup" className="form-check-label">
                Can leave group
              </label>
              <div className="text-muted small">Allow students to leave groups.</div>
            </div>

            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                id="studentPermissions-canNameGroup"
                defaultChecked
                {...register('studentPermissions.canNameGroup')}
              />
              <label htmlFor="studentPermissions-canNameGroup" className="form-check-label">
                Can name group
              </label>
              <div className="text-muted small">
                Allow students to choose a group name when creating a group. If set to false, a
                default name will be used.
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h6>Group size</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="groupSettings-minMembers" className="form-label">
                  Minimum members
                </label>
                <input
                  type="number"
                  className={clsx(
                    'form-control',
                    (groupSizeError || errors.minMembers) && 'is-invalid',
                  )}
                  id="groupSettings-minMembers"
                  placeholder="0"
                  aria-invalid={groupSizeError || errors.minMembers ? 'true' : undefined}
                  defaultValue={groupSettingsDefaults?.minMembers ?? groupConfigInfo.minimum ?? ''}
                  {...register('minMembers', {
                    valueAsNumber: true,
                    min: { value: 1, message: 'Must be at least 1.' },
                    onChange: (e) => {
                      const newMin = e.target.valueAsNumber;
                      const currentMax = getValues('maxMembers');
                      if (!Number.isNaN(newMin) && currentMax != null && newMin > currentMax) {
                        setValue('maxMembers', newMin, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    },
                  })}
                />
                {errors.minMembers && (
                  <div className="text-danger small">{errors.minMembers.message}</div>
                )}
                <div className="text-muted small">The minimum number of students in a group.</div>
              </div>
              <div className="col-md-6">
                <label htmlFor="groupSettings-maxMembers" className="form-label">
                  Maximum members
                </label>
                <input
                  type="number"
                  className={clsx(
                    'form-control',
                    (groupSizeError || errors.maxMembers) && 'is-invalid',
                  )}
                  id="groupSettings-maxMembers"
                  placeholder="0"
                  aria-invalid={groupSizeError || errors.maxMembers ? 'true' : undefined}
                  defaultValue={groupSettingsDefaults?.maxMembers ?? groupConfigInfo.maximum ?? ''}
                  {...register('maxMembers', {
                    valueAsNumber: true,
                    min: { value: 1, message: 'Must be at least 1.' },
                  })}
                />
                {errors.maxMembers && (
                  <div className="text-danger small">{errors.maxMembers.message}</div>
                )}
                <div className="text-muted small">The maximum number of students in a group.</div>
              </div>
            </div>
            {groupSizeError && (
              <div className="text-danger small mt-2">
                <i className="bi bi-exclamation-circle me-1" aria-hidden="true" />
                {groupSizeError}
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center gap-2">
              <h5 className="mb-0">Roles</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => append(makeRole({ canAssignRoles: true }))}
              >
                <i className="bi bi-plus-lg" aria-hidden="true" /> Add role
              </button>
            </div>

            <div className="text-muted small mb-3">
              Configure{' '}
              <a href="https://docs.prairielearn.com/assessment/configuration/#enabling-custom-group-roles">
                custom group roles
              </a>
              , which can be assigned different permissions to facilitate role-based teamwork.
            </div>

            <div className="card overflow-x-auto">
              <div className="roles-grid-header">
                <div>Name</div>
                <div>
                  Min assignees{' '}
                  <OverlayTrigger
                    placement="top"
                    tooltip={{
                      body: 'Minimum number of students that must be assigned to this role.',
                      props: { id: 'role-min-assignees-tooltip' },
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost p-0 align-baseline"
                      aria-label="Min assignees help"
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </button>
                  </OverlayTrigger>
                </div>
                <div>
                  Max assignees{' '}
                  <OverlayTrigger
                    placement="top"
                    tooltip={{
                      body: 'Maximum number of students that can be assigned to this role. Leave blank for unlimited.',
                      props: { id: 'role-max-assignees-tooltip' },
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost p-0 align-baseline"
                      aria-label="Max assignees help"
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </button>
                  </OverlayTrigger>
                </div>
                <div className="text-center">
                  Can assign{' '}
                  <OverlayTrigger
                    placement="top"
                    tooltip={{
                      body: 'Students with this role can assign roles to other students in the group.',
                      props: { id: 'role-can-assign-tooltip' },
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost p-0 align-baseline"
                      aria-label="Can assign roles help"
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </button>
                  </OverlayTrigger>
                </div>
                <div className="text-center">
                  Can view{' '}
                  <OverlayTrigger
                    placement="top"
                    tooltip={{
                      body: 'Students with this role can view assessment questions by default.',
                      props: { id: 'role-can-view-tooltip' },
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost p-0 align-baseline"
                      aria-label="Can view help"
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </button>
                  </OverlayTrigger>
                </div>
                <div className="text-center">
                  Can submit{' '}
                  <OverlayTrigger
                    placement="top"
                    tooltip={{
                      body: 'Students with this role can submit answers to assessment questions by default.',
                      props: { id: 'role-can-submit-tooltip' },
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost p-0 align-baseline"
                      aria-label="Can submit help"
                    >
                      <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                    </button>
                  </OverlayTrigger>
                </div>
                <div />
              </div>

              {fields.length === 0 ? (
                <div className="roles-grid-row text-center text-muted">
                  <div className="roles-grid-row__span-all">
                    <div>
                      <i className="bi bi-person-badge me-2" aria-hidden="true" />
                      No roles configured
                    </div>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 mt-2"
                      onClick={() => setShowRecommendedRolesModal(true)}
                    >
                      Use recommended configuration
                    </button>
                  </div>
                </div>
              ) : (
                fields.map((field, index) => {
                  const rowErrors = errors.roles?.[index];
                  const minError = rowErrors?.minAssignees;
                  const maxError = rowErrors?.maxAssignees;
                  const sizeValidateError =
                    minError?.type === 'validate' || maxError?.type === 'validate';
                  return (
                    <div key={field.id} className="roles-grid-row">
                      <input
                        type="hidden"
                        defaultValue={field.origName ?? ''}
                        {...register(`roles.${index}.origName`)}
                      />
                      <div>
                        <input
                          type="text"
                          className={clsx(
                            'form-control form-control-sm',
                            rowErrors?.name && 'is-invalid',
                          )}
                          placeholder="e.g. Manager"
                          defaultValue={field.name}
                          aria-invalid={rowErrors?.name ? 'true' : undefined}
                          {...register(`roles.${index}.name`, {
                            required: 'Name is required.',
                            validate: (value) => {
                              const allNames = watchedRoles.map((r) => r.name);
                              const dupes = allNames.filter((n) => n === value);
                              return dupes.length <= 1 || 'Duplicate role name.';
                            },
                          })}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          className={clsx(
                            'form-control form-control-sm',
                            (!!minError || sizeValidateError) && 'is-invalid',
                          )}
                          placeholder="0"
                          defaultValue={field.minAssignees ?? ''}
                          aria-invalid={!!minError || sizeValidateError ? 'true' : undefined}
                          {...register(`roles.${index}.minAssignees`, {
                            valueAsNumber: true,
                            deps: [`roles.${index}.maxAssignees`],
                            min: { value: 0, message: 'Must be ≥ 0.' },
                            validate: (value) => {
                              const max = watchedRoles[index]?.maxAssignees;
                              if (value != null && max != null && value > max) {
                                return 'Must be ≤ max assignees.';
                              }
                              return true;
                            },
                            onChange: (e) => {
                              const newMin = e.target.valueAsNumber;
                              const currentMax = getValues(`roles.${index}.maxAssignees`);
                              if (
                                !Number.isNaN(newMin) &&
                                currentMax != null &&
                                newMin > currentMax
                              ) {
                                setValue(`roles.${index}.maxAssignees`, newMin, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              }
                            },
                          })}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          className={clsx(
                            'form-control form-control-sm',
                            (!!maxError || sizeValidateError) && 'is-invalid',
                          )}
                          placeholder="0"
                          defaultValue={field.maxAssignees ?? ''}
                          aria-invalid={!!maxError || sizeValidateError ? 'true' : undefined}
                          {...register(`roles.${index}.maxAssignees`, {
                            valueAsNumber: true,
                            deps: [`roles.${index}.minAssignees`],
                            min: { value: 1, message: 'Must be ≥ 1.' },
                            validate: (value) => {
                              const min = watchedRoles[index]?.minAssignees;
                              if (value != null && min != null && min > value) {
                                return 'Must be ≥ min assignees.';
                              }
                              return true;
                            },
                          })}
                        />
                      </div>
                      <div className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={`Can assign roles for ${field.name || 'this role'}`}
                          {...register(`roles.${index}.canAssignRoles`)}
                        />
                      </div>
                      <div className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={`Can view for ${field.name || 'this role'}`}
                          {...register(`roles.${index}.canView`, {
                            onChange: (e) => {
                              if (!e.target.checked) {
                                setValue(`roles.${index}.canSubmit`, false, { shouldDirty: true });
                              }
                            },
                          })}
                        />
                      </div>
                      <div className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          disabled={!watchedRoles[index]?.canView}
                          aria-label={
                            watchedRoles[index]?.canView
                              ? `Can submit for ${field.name || 'this role'}`
                              : `Can submit for ${field.name || 'this role'} (requires can view)`
                          }
                          title={
                            watchedRoles[index]?.canView
                              ? undefined
                              : "Enable 'Can view' first to allow submission"
                          }
                          {...register(`roles.${index}.canSubmit`)}
                        />
                      </div>
                      <div className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          aria-label={`Remove role ${index + 1}`}
                          onClick={() => remove(index)}
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </div>

                      {rowErrors?.name && (
                        <div className="text-danger small roles-grid-row__error-name">
                          {rowErrors.name.message}
                        </div>
                      )}
                      {sizeValidateError && (
                        <div className="text-danger small roles-grid-row__error-size-both">
                          Min assignees must be less than or equal to max assignees.
                        </div>
                      )}
                      {!sizeValidateError && minError && (
                        <div className="text-danger small roles-grid-row__error-min">
                          {minError.message}
                        </div>
                      )}
                      {!sizeValidateError && maxError && (
                        <div className="text-danger small roles-grid-row__error-max">
                          {maxError.message}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {roleErrors.length > 0 && (
              <div className="mt-3">
                {roleErrors.map((error) => (
                  <Alert key={error} variant="danger" className="mb-2 small">
                    <i className="bi bi-exclamation-circle me-2" aria-hidden="true" />
                    {error}
                  </Alert>
                ))}
              </div>
            )}

            {roleWarnings.length > 0 && (
              <div className="mt-3">
                {roleWarnings.map((warning) => (
                  <Alert key={warning} variant="warning" className="mb-2 small">
                    <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
                    {warning}
                  </Alert>
                ))}
              </div>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={!isDirty}
              onClick={() => reset()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !isDirty ||
                !isValid ||
                !!groupSizeError ||
                roleErrors.length > 0 ||
                mutation.isPending
              }
            >
              Save and sync
            </button>
          </div>
        </form>
      </div>
    </div>
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
