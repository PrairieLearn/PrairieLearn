import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Alert, Modal } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { HelpTooltip } from '../../../components/HelpTooltip.js';
import { getAppError } from '../../../lib/client/errors.js';
import { type StaffGroupConfig } from '../../../lib/client/safe-db-types.js';
import { type GroupSettingsFormValues, makeRole } from '../../../lib/group-config.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { ActionAccess } from '../types.js';

const SAVE_FAILED_FALLBACK = 'Failed to save group configuration.';

const numberOrNull = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

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
  editAccess,
  onOrigHashChange,
  onGroupSizeSaved,
  onSaved,
  onSaveError,
  onClearSaveStatus,
}: {
  groupConfigInfo: StaffGroupConfig;
  groupSettingsDefaults: GroupSettingsFormValues | null;
  origHash: string | null;
  editAccess: ActionAccess;
  onOrigHashChange: (hash: string | null) => void;
  onGroupSizeSaved: (min: number | null, max: number | null) => void;
  onSaved: () => void;
  onSaveError: (message: string) => void;
  onClearSaveStatus: () => void;
}) {
  const [showRecommendedRolesModal, setShowRecommendedRolesModal] = useState(false);
  const canEdit = editAccess.status === 'allowed';
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.updateGroupConfig.mutationOptions());

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    getValues,
    formState: { isDirty, isValid, errors },
  } = useForm<GroupSettingsFormValues>({
    mode: 'onChange',
    defaultValues: {
      studentPermissions: groupSettingsDefaults?.studentPermissions ?? {
        canCreateGroup: true,
        canJoinGroup: true,
        canLeaveGroup: true,
        canNameGroup: true,
      },
      minMembers: groupSettingsDefaults?.minMembers ?? groupConfigInfo.minimum ?? null,
      maxMembers: groupSettingsDefaults?.maxMembers ?? groupConfigInfo.maximum ?? null,
      roles: groupSettingsDefaults?.roles ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'roles' });

  const watchedMin = watch('minMembers');
  const watchedRoles = watch('roles');
  const watchedCanCreateGroup = watch('studentPermissions.canCreateGroup');

  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Group-role warnings are represented as manual react-hook-form errors. */
  useEffect(() => {
    const violations: Record<string, string> = {};
    if (watchedRoles.length > 0) {
      const hasAssigner = watchedRoles.some(
        (role) => role.canAssignRoles && (role.minAssignees ?? 0) >= 1,
      );
      if (!hasAssigner) {
        violations.noAssigner =
          'No roles with the "Can assign roles" permission have a minimum member count of 1 or more.';
      }
      if (!watchedRoles.some((r) => r.canView)) {
        violations.noViewer = 'At least one role must be able to view questions.';
      }
      if (!watchedRoles.some((r) => r.canSubmit)) {
        violations.noSubmitter = 'At least one role must be able to submit answers.';
      }
      watchedRoles.forEach((r, idx) => {
        if (!r.canView && !r.canSubmit && !r.canAssignRoles) {
          const name = r.name || '(unnamed)';
          violations[`roleNoPermissions${idx}`] =
            `"${name}" has no permissions — students with this role won't be able to view, submit, or assign roles.`;
        }
      });
    }

    const possibleKeys = [
      'noAssigner',
      'noViewer',
      'noSubmitter',
      ...watchedRoles.map((_, i) => `roleNoPermissions${i}`),
    ];
    for (const key of possibleKeys) {
      if (violations[key]) {
        setError(`root.${key}`, { type: 'manual', message: violations[key] });
      } else {
        clearErrors(`root.${key}`);
      }
    }
  }, [watchedRoles, setError, clearErrors]);
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  const formLevelRoleErrors = Object.values(errors.root ?? {})
    .map((e) => (typeof e === 'object' ? e.message : null))
    .filter((m): m is string => typeof m === 'string');
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
    }
    return warnings;
  });

  const onSubmit = (data: GroupSettingsFormValues) => {
    mutation.mutate(
      {
        origHash,
        canCreateGroup: data.studentPermissions.canCreateGroup,
        canJoinGroup: data.studentPermissions.canJoinGroup,
        canLeaveGroup: data.studentPermissions.canLeaveGroup,
        canNameGroup: data.studentPermissions.canNameGroup,
        minMembers: data.minMembers,
        maxMembers: data.maxMembers,
        roles: data.roles,
      },
      {
        onSuccess: ({ origHash: newHash }) => {
          onOrigHashChange(newHash);
          onGroupSizeSaved(data.minMembers, data.maxMembers);
          reset({
            ...data,
            roles: data.roles.map((r) => ({ ...r, origName: r.name })),
          });
          onSaved();
        },
        onError: (err) => {
          const appError = getAppError<AssessmentGroupsError['UpdateGroupConfig']>(err);
          onSaveError(appError?.message ?? SAVE_FAILED_FALLBACK);
        },
      },
    );
  };

  const wasDirtyRef = useRef(isDirty);
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Clear stale save status on the first dirty transition after a save. */
  useEffect(() => {
    if (isDirty && !wasDirtyRef.current) onClearSaveStatus();
    wasDirtyRef.current = isDirty;
  }, [isDirty, onClearSaveStatus]);
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

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
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="card-body">
          <h5 className="mb-1">Group settings</h5>
          <div className="text-muted small mb-4">
            Configure how groups work for this assessment.
          </div>
          {editAccess.status === 'denied' && (
            <Alert variant="info" className="mb-4">
              {editAccess.reason}
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
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canCreateGroup ?? true}
                  {...register('studentPermissions.canCreateGroup', {
                    onChange: (e) => {
                      if (!e.target.checked) {
                        setValue('studentPermissions.canNameGroup', false, {
                          shouldDirty: true,
                        });
                      }
                    },
                  })}
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
                  id="studentPermissions-canNameGroup"
                  disabled={!watchedCanCreateGroup}
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

              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="studentPermissions-canJoinGroup"
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canJoinGroup ?? true}
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
                  defaultChecked={groupSettingsDefaults?.studentPermissions.canLeaveGroup ?? true}
                  {...register('studentPermissions.canLeaveGroup')}
                />
                <label htmlFor="studentPermissions-canLeaveGroup" className="form-check-label">
                  Can leave group
                </label>
                <div className="text-muted small">Allow students to leave groups.</div>
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
                    className={clsx('form-control', errors.minMembers && 'is-invalid')}
                    id="groupSettings-minMembers"
                    placeholder="None"
                    aria-invalid={errors.minMembers ? 'true' : undefined}
                    aria-errormessage={
                      errors.minMembers ? 'groupSettings-minMembersError' : undefined
                    }
                    defaultValue={
                      groupSettingsDefaults?.minMembers ?? groupConfigInfo.minimum ?? ''
                    }
                    {...register('minMembers', {
                      setValueAs: numberOrNull,
                      min: { value: 1, message: 'Must be at least 1.' },
                      onChange: (e) => {
                        const newMin = numberOrNull(e.target.value);
                        const currentMax = getValues('maxMembers');
                        if (newMin != null && currentMax != null && newMin > currentMax) {
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
                    className={clsx('form-control', errors.maxMembers && 'is-invalid')}
                    id="groupSettings-maxMembers"
                    placeholder="None"
                    aria-invalid={errors.maxMembers ? 'true' : undefined}
                    aria-errormessage={
                      errors.maxMembers ? 'groupSettings-maxMembersError' : undefined
                    }
                    defaultValue={
                      groupSettingsDefaults?.maxMembers ?? groupConfigInfo.maximum ?? ''
                    }
                    {...register('maxMembers', {
                      setValueAs: numberOrNull,
                      min: { value: 1, message: 'Must be at least 1.' },
                      validate: (value) => {
                        const min = getValues('minMembers');
                        if (value != null && min != null && value < min) {
                          return 'Maximum members cannot be less than minimum members.';
                        }
                        return true;
                      },
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
            </div>

            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center gap-2">
                <h5 className="mb-0">Roles</h5>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => append(makeRole({ canAssignRoles: true, minAssignees: 1 }))}
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
                        <HelpTooltip
                          body="Minimum number of students that must be assigned to this role."
                          id="role-min-assignees-tooltip"
                          ariaLabel="Min assignees help"
                        />
                      </th>
                      <th scope="col">
                        Max assignees{' '}
                        <HelpTooltip
                          body="Maximum number of students that can be assigned to this role. Leave blank for unlimited."
                          id="role-max-assignees-tooltip"
                          ariaLabel="Max assignees help"
                        />
                      </th>
                      <th scope="col" className="text-center">
                        Can assign{' '}
                        <HelpTooltip
                          body="Students with this role can assign roles to other students in the group."
                          id="role-can-assign-tooltip"
                          ariaLabel="Can assign roles help"
                        />
                      </th>
                      <th scope="col" className="text-center">
                        Can view{' '}
                        <HelpTooltip
                          body="Students with this role can view assessment questions by default."
                          id="role-can-view-tooltip"
                          ariaLabel="Can view help"
                        />
                      </th>
                      <th scope="col" className="text-center">
                        Can submit{' '}
                        <HelpTooltip
                          body="Students with this role can submit answers to assessment questions by default."
                          id="role-can-submit-tooltip"
                          ariaLabel="Can submit help"
                        />
                      </th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.length === 0 ? (
                      <tr className="text-center text-muted">
                        <td colSpan={7} className="py-3">
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
                        const rowNumber = index + 1;
                        const nameErrorId = `role-${index}-nameError`;
                        const minErrorId = `role-${index}-minError`;
                        const maxErrorId = `role-${index}-maxError`;
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
                                    deps: watchedRoles.map((_, i) => `roles.${i}.name` as const),
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
                                    !!minError && 'is-invalid',
                                  )}
                                  placeholder="None"
                                  defaultValue={field.minAssignees ?? ''}
                                  aria-label={`Min assignees for role ${rowNumber}`}
                                  aria-invalid={minError ? 'true' : undefined}
                                  aria-errormessage={minError ? minErrorId : undefined}
                                  {...register(`roles.${index}.minAssignees`, {
                                    setValueAs: numberOrNull,
                                    deps: [`roles.${index}.maxAssignees`, 'maxMembers'],
                                    min: { value: 0, message: 'Must be ≥ 0.' },
                                    validate: (value) => {
                                      const max = getValues(`roles.${index}.maxAssignees`);
                                      if (value != null && max != null && value > max) {
                                        return 'Must be ≤ max assignees.';
                                      }
                                      const maxMembers = getValues('maxMembers');
                                      if (
                                        value != null &&
                                        maxMembers != null &&
                                        value > maxMembers
                                      ) {
                                        return `Must be ≤ group maximum (${maxMembers}).`;
                                      }
                                      return true;
                                    },
                                    onChange: (e) => {
                                      const newMin = numberOrNull(e.target.value);
                                      const currentMax = getValues(`roles.${index}.maxAssignees`);
                                      if (
                                        newMin != null &&
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
                                    !!maxError && 'is-invalid',
                                  )}
                                  placeholder="None"
                                  defaultValue={field.maxAssignees ?? ''}
                                  aria-label={`Max assignees for role ${rowNumber}`}
                                  aria-invalid={maxError ? 'true' : undefined}
                                  aria-errormessage={maxError ? maxErrorId : undefined}
                                  {...register(`roles.${index}.maxAssignees`, {
                                    setValueAs: numberOrNull,
                                    deps: [`roles.${index}.minAssignees`, 'maxMembers'],
                                    min: { value: 1, message: 'Must be ≥ 1.' },
                                    validate: (value) => {
                                      const min = getValues(`roles.${index}.minAssignees`);
                                      if (value != null && min != null && min > value) {
                                        return 'Must be ≥ min assignees.';
                                      }
                                      const maxMembers = getValues('maxMembers');
                                      if (
                                        value != null &&
                                        maxMembers != null &&
                                        value > maxMembers
                                      ) {
                                        return `Must be ≤ group maximum (${maxMembers}).`;
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
                                  aria-label={`Can assign roles for ${watchedRoles[index]?.name || 'this role'}`}
                                  defaultChecked={field.canAssignRoles}
                                  {...register(`roles.${index}.canAssignRoles`)}
                                />
                              </td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={`Can view for ${watchedRoles[index]?.name || 'this role'}`}
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
                                      ? `Can submit for ${watchedRoles[index]?.name || 'this role'}`
                                      : `Can submit for ${watchedRoles[index]?.name || 'this role'} (requires can view)`
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
                            {(rowErrors?.name || minError || maxError) && (
                              <tr>
                                {rowErrors.name ? (
                                  <td id={nameErrorId} className="text-danger small pt-0">
                                    {rowErrors.name.message}
                                  </td>
                                ) : (
                                  <td className="pt-0" />
                                )}
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

              {formLevelRoleErrors.length > 0 && (
                <div className="mt-3">
                  {formLevelRoleErrors.map((error) => (
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
        </div>
        {canEdit && (
          <div className="card-footer d-flex justify-content-end gap-2">
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
                !isDirty || !isValid || formLevelRoleErrors.length > 0 || mutation.isPending
              }
            >
              Save and sync
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
