import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { getAppError } from '../../../lib/client/errors.js';
import { type StaffGroupConfig } from '../../../lib/client/safe-db-types.js';
import { type GroupSettingsFormValues, makeRole } from '../../../lib/group-config.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

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

export function GroupSettingsCard({
  groupConfigInfo,
  groupSettingsDefaults,
  origHash,
  canEdit,
  onOrigHashChange,
  onGroupSizeSaved,
}: {
  groupConfigInfo: StaffGroupConfig;
  groupSettingsDefaults: GroupSettingsFormValues | null;
  origHash: string | null;
  canEdit: boolean;
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
    const normalized: GroupSettingsFormValues = {
      ...data,
      minMembers: nanToNull(data.minMembers),
      maxMembers: nanToNull(data.maxMembers),
      roles: data.roles.map((r) => ({
        ...r,
        minAssignees: nanToNull(r.minAssignees),
        maxAssignees: nanToNull(r.maxAssignees),
      })),
    };
    mutation.mutate(
      {
        origHash,
        canCreateGroup: normalized.studentPermissions.canCreateGroup,
        canJoinGroup: normalized.studentPermissions.canJoinGroup,
        canLeaveGroup: normalized.studentPermissions.canLeaveGroup,
        canNameGroup: normalized.studentPermissions.canNameGroup,
        minMembers: normalized.minMembers,
        maxMembers: normalized.maxMembers,
        roles: normalized.roles,
      },
      {
        onSuccess: ({ origHash: newHash }) => {
          onOrigHashChange(newHash);
          onGroupSizeSaved(normalized.minMembers, normalized.maxMembers);
          reset({
            ...normalized,
            roles: normalized.roles.map((r) => ({ ...r, origName: r.name })),
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
          <fieldset disabled={!canEdit}>
            <div className="mb-4">
              <h6>Student permissions</h6>

              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="studentPermissions-canCreateGroup"
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canCreateGroup ?? false}
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
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canJoinGroup ?? false}
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
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canLeaveGroup ?? false}
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
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canNameGroup ?? true}
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
                    aria-errormessage={
                      errors.minMembers
                        ? 'groupSettings-minMembersError'
                        : groupSizeError
                          ? 'groupSettings-sizeError'
                          : undefined
                    }
                    defaultValue={
                      groupSettingsDefaults?.minMembers ?? groupConfigInfo.minimum ?? ''
                    }
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
                    <div id="groupSettings-minMembersError" className="text-danger small">
                      {errors.minMembers.message}
                    </div>
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
                    aria-errormessage={
                      errors.maxMembers
                        ? 'groupSettings-maxMembersError'
                        : groupSizeError
                          ? 'groupSettings-sizeError'
                          : undefined
                    }
                    defaultValue={
                      groupSettingsDefaults?.maxMembers ?? groupConfigInfo.maximum ?? ''
                    }
                    {...register('maxMembers', {
                      valueAsNumber: true,
                      min: { value: 1, message: 'Must be at least 1.' },
                    })}
                  />
                  {errors.maxMembers && (
                    <div id="groupSettings-maxMembersError" className="text-danger small">
                      {errors.maxMembers.message}
                    </div>
                  )}
                  <div className="text-muted small">The maximum number of students in a group.</div>
                </div>
              </div>
              {groupSizeError && (
                <div id="groupSettings-sizeError" className="text-danger small mt-2">
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
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">
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
                      </th>
                      <th scope="col">
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
                      </th>
                      <th scope="col" className="text-center">
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
                      </th>
                      <th scope="col" className="text-center">
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
                      </th>
                      <th scope="col" className="text-center">
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
                      </th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.length === 0 ? (
                      <tr className="text-center text-muted">
                        <td colSpan={7}>
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
                        </td>
                      </tr>
                    ) : (
                      fields.map((field, index) => {
                        const rowErrors = errors.roles?.[index];
                        const minError = rowErrors?.minAssignees;
                        const maxError = rowErrors?.maxAssignees;
                        const sizeValidateError =
                          minError?.type === 'validate' || maxError?.type === 'validate';
                        const rowNumber = index + 1;
                        const nameErrorId = `role-${index}-nameError`;
                        const minErrorId = `role-${index}-minError`;
                        const maxErrorId = `role-${index}-maxError`;
                        const sizeErrorId = `role-${index}-sizeError`;
                        return (
                          <Fragment key={field.id}>
                            <tr>
                              <td>
                                <input
                                  type="hidden"
                                  defaultValue={field.origName ?? ''}
                                  {...register(`roles.${index}.origName`)}
                                />
                                <input
                                  type="text"
                                  className={clsx(
                                    'form-control form-control-sm',
                                    rowErrors?.name && 'is-invalid',
                                  )}
                                  placeholder="e.g. Manager"
                                  defaultValue={field.name}
                                  aria-label={`Role ${rowNumber} name`}
                                  aria-invalid={rowErrors?.name ? 'true' : undefined}
                                  aria-errormessage={rowErrors?.name ? nameErrorId : undefined}
                                  {...register(`roles.${index}.name`, {
                                    required: 'Name is required.',
                                    validate: (value) => {
                                      const allNames = getValues('roles').map((r) => r.name);
                                      const dupes = allNames.filter((n) => n === value);
                                      return dupes.length <= 1 || 'Duplicate role name.';
                                    },
                                  })}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={clsx(
                                    'form-control form-control-sm',
                                    (!!minError || sizeValidateError) && 'is-invalid',
                                  )}
                                  placeholder="0"
                                  defaultValue={field.minAssignees ?? ''}
                                  aria-label={`Min assignees for role ${rowNumber}`}
                                  aria-invalid={
                                    !!minError || sizeValidateError ? 'true' : undefined
                                  }
                                  aria-errormessage={
                                    sizeValidateError
                                      ? sizeErrorId
                                      : minError
                                        ? minErrorId
                                        : undefined
                                  }
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
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={clsx(
                                    'form-control form-control-sm',
                                    (!!maxError || sizeValidateError) && 'is-invalid',
                                  )}
                                  placeholder="0"
                                  defaultValue={field.maxAssignees ?? ''}
                                  aria-label={`Max assignees for role ${rowNumber}`}
                                  aria-invalid={
                                    !!maxError || sizeValidateError ? 'true' : undefined
                                  }
                                  aria-errormessage={
                                    sizeValidateError
                                      ? sizeErrorId
                                      : maxError
                                        ? maxErrorId
                                        : undefined
                                  }
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
                              </td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={`Can assign roles for ${field.name || 'this role'}`}
                                  defaultChecked={field.canAssignRoles}
                                  {...register(`roles.${index}.canAssignRoles`)}
                                />
                              </td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={`Can view for ${field.name || 'this role'}`}
                                  defaultChecked={field.canView}
                                  {...register(`roles.${index}.canView`, {
                                    onChange: (e) => {
                                      if (!e.target.checked) {
                                        setValue(`roles.${index}.canSubmit`, false, {
                                          shouldDirty: true,
                                        });
                                      }
                                    },
                                  })}
                                />
                              </td>
                              <td className="text-center">
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
                                  defaultChecked={field.canSubmit}
                                  {...register(`roles.${index}.canSubmit`)}
                                />
                              </td>
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  aria-label={`Remove role ${index + 1}`}
                                  onClick={() => remove(index)}
                                >
                                  <i className="bi bi-trash" aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                            {(rowErrors?.name || sizeValidateError || minError || maxError) && (
                              <tr>
                                {rowErrors?.name ? (
                                  <td id={nameErrorId} className="text-danger small pt-0">
                                    {rowErrors.name.message}
                                  </td>
                                ) : (
                                  <td className="pt-0" />
                                )}
                                {sizeValidateError ? (
                                  <td
                                    id={sizeErrorId}
                                    colSpan={2}
                                    className="text-danger small pt-0"
                                  >
                                    Min assignees must be less than or equal to max assignees.
                                  </td>
                                ) : (
                                  <>
                                    {minError ? (
                                      <td id={minErrorId} className="text-danger small pt-0">
                                        {minError.message}
                                      </td>
                                    ) : (
                                      <td className="pt-0" />
                                    )}
                                    {maxError ? (
                                      <td id={maxErrorId} className="text-danger small pt-0">
                                        {maxError.message}
                                      </td>
                                    ) : (
                                      <td className="pt-0" />
                                    )}
                                  </>
                                )}
                                <td colSpan={4} className="pt-0" />
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
          </fieldset>
          {canEdit && (
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
          )}
        </form>
      </div>
    </div>
  );
}
