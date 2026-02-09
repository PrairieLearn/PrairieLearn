import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { computeStatus } from '../../../lib/publishing.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import type { StudentRow } from '../instructorStudents.shared.js';

import { type StudentSyncItem, type SyncPreview, computeSyncDiff } from './sync-students-diff.js';

interface SyncStudentsForm {
  uids: string;
}

type SyncStep = 'input' | 'preview';

const MAX_UIDS = 5000;

interface StudentCheckboxListProps {
  items: StudentSyncItem[];
  selectedUids: Set<string>;
  onToggle: (uid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  variant: 'invite' | 'cancel' | 'remove';
}

function StudentCheckboxList({
  items,
  selectedUids,
  onToggle,
  onSelectAll,
  onDeselectAll,
  variant,
}: StudentCheckboxListProps) {
  if (items.length === 0) return null;

  const selectedCount = items.filter((item) => selectedUids.has(item.uid)).length;

  const variantConfig = {
    invite: {
      icon: 'bi-person-plus',
      iconColor: 'text-success',
      iconBg: 'bg-success-subtle',
      label: 'Students to invite or re-enroll',
      ariaLabel: 'Students to invite or re-enroll',
      description: 'New students will be invited. Blocked or removed students will be re-enrolled.',
    },
    cancel: {
      icon: 'bi-x-circle',
      iconColor: 'text-warning',
      iconBg: 'bg-warning-subtle',
      label: 'Invitations to cancel',
      ariaLabel: 'Invitations to cancel',
      description: 'Pending invitations will be cancelled.',
    },
    remove: {
      icon: 'bi-person-dash',
      iconColor: 'text-danger',
      iconBg: 'bg-danger-subtle',
      label: 'Students to remove',
      ariaLabel: 'Students to remove',
      description: 'Joined students not on the roster will be removed from the course.',
    },
  };

  const config = variantConfig[variant];

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center gap-3">
        <div
          className={clsx(
            config.iconBg,
            'rounded d-flex align-items-center justify-content-center flex-shrink-0',
          )}
          style={{ width: '2.5rem', height: '2.5rem' }}
        >
          <i
            className={clsx('bi', config.icon, config.iconColor)}
            style={{ fontSize: '1.25rem' }}
            aria-hidden="true"
          />
        </div>
        <div className="flex-grow-1">
          <h6 className="mb-0">
            {config.label} ({selectedCount} of {items.length} selected)
          </h6>
          <p className="text-muted small mb-0">{config.description}</p>
        </div>
        <div className="btn-group btn-group-sm flex-shrink-0">
          <Button variant="outline-secondary" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={onDeselectAll}>
            Clear
          </Button>
        </div>
      </div>

      <div
        className="border rounded"
        style={{ maxHeight: '200px', overflowY: 'auto' }}
        role="group"
        aria-label={config.ariaLabel}
      >
        {items.map((item, index) => (
          <div
            key={item.uid}
            className={clsx('px-3 py-2', index !== items.length - 1 && 'border-bottom')}
          >
            <Form.Check
              type="checkbox"
              id={`sync-${variant}-${item.uid}`}
              className="d-flex gap-2 align-items-center mb-0"
            >
              <Form.Check.Input
                type="checkbox"
                className="mt-0"
                checked={selectedUids.has(item.uid)}
                onChange={() => onToggle(item.uid)}
              />
              <Form.Check.Label className="d-flex align-items-center gap-2 flex-grow-1">
                <span className="d-flex flex-column">
                  <span>{item.uid}</span>
                  {item.userName && <span className="text-muted small">{item.userName}</span>}
                </span>
                <span className="ms-auto">
                  {item.currentStatus ? (
                    <EnrollmentStatusIcon status={item.currentStatus} type="badge" />
                  ) : (
                    <span className="badge bg-info">New</span>
                  )}
                </span>
              </Form.Check.Label>
            </Form.Check>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SyncStudentsModal({
  show,
  courseInstance,
  students,
  onHide,
  onSubmit,
}: {
  show: boolean;
  courseInstance: StaffCourseInstance;
  students: StudentRow[];
  onHide: () => void;
  onSubmit: (toInvite: string[], toCancelInvitation: string[], toRemove: string[]) => Promise<void>;
}) {
  const [step, setStep] = useState<SyncStep>('input');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(() => new Set());
  const [selectedCancellations, setSelectedCancellations] = useState<Set<string>>(() => new Set());
  const [selectedRemovals, setSelectedRemovals] = useState<Set<string>>(() => new Set());

  const {
    register,
    handleSubmit,
    clearErrors,
    reset,
    getValues,
    formState: { errors },
  } = useForm<SyncStudentsForm>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: { uids: '' },
  });

  const validateUidsFormat = (value: string): string | true => {
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(value, MAX_UIDS);
    } catch (error) {
      return error instanceof Error ? error.message : 'An error occurred';
    }

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidUids = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidUids.length > 0) {
      return `The following UIDs were invalid: "${invalidUids.join('", "')}"`;
    }

    return true;
  };

  const onCompare = handleSubmit(() => {
    const uids = parseUniqueValuesFromString(getValues('uids'), MAX_UIDS);
    const diff = computeSyncDiff(uids, students);
    setPreview(diff);
    // Pre-select all items by default
    setSelectedInvites(new Set(diff.toInvite.map((item) => item.uid)));
    setSelectedCancellations(new Set(diff.toCancelInvitation.map((item) => item.uid)));
    setSelectedRemovals(new Set(diff.toRemove.map((item) => item.uid)));
    setStep('preview');
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const toInvite = Array.from(selectedInvites);
      const toCancelInvitation = Array.from(selectedCancellations);
      const toRemove = Array.from(selectedRemovals);
      return onSubmit(toInvite, toCancelInvitation, toRemove);
    },
    // Note: onSubmit navigates to the job sequence page via window.location.href,
    // so onSuccess won't visibly affect the UI.
    onSuccess: onHide,
  });

  const resetModalState = () => {
    reset();
    clearErrors();
    setStep('input');
    setPreview(null);
    setSelectedInvites(new Set());
    setSelectedCancellations(new Set());
    setSelectedRemovals(new Set());
    syncMutation.reset();
  };

  const toggleInvite = (uid: string) => {
    setSelectedInvites((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const toggleCancellation = (uid: string) => {
    setSelectedCancellations((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const toggleRemoval = (uid: string) => {
    setSelectedRemovals((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const hasNoChanges = useMemo(() => {
    if (!preview) return false;
    return (
      preview.toInvite.length === 0 &&
      preview.toCancelInvitation.length === 0 &&
      preview.toRemove.length === 0
    );
  }, [preview]);

  const totalSelectedCount =
    selectedInvites.size + selectedCancellations.size + selectedRemovals.size;
  const hasNoSelections = totalSelectedCount === 0;

  const summaryCounts = useMemo(() => {
    if (!preview) return { invitations: 0, reEnrollments: 0, cancellations: 0, removals: 0 };
    let invitations = 0;
    let reEnrollments = 0;
    for (const item of preview.toInvite) {
      if (!selectedInvites.has(item.uid)) continue;
      if (item.currentStatus === 'blocked' || item.currentStatus === 'removed') {
        reEnrollments++;
      } else {
        invitations++;
      }
    }
    return {
      invitations,
      reEnrollments,
      cancellations: selectedCancellations.size,
      removals: selectedRemovals.size,
    };
  }, [preview, selectedInvites, selectedCancellations.size, selectedRemovals.size]);

  const isUnpublished =
    courseInstance.modern_publishing &&
    computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
      'published';

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Sync roster</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {syncMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => syncMutation.reset()}>
            {syncMutation.error instanceof Error ? syncMutation.error.message : 'An error occurred'}
          </Alert>
        )}

        {step === 'input' && (
          <div className="d-flex flex-column gap-3">
            <form onSubmit={onCompare}>
              <p>
                Paste your student roster below. Students on this list will be invited (or
                re-enrolled if previously blocked or removed). Students not on this list will be
                removed, and pending invitations will be cancelled.
              </p>
              <div>
                <label htmlFor="sync-uids" className="form-label">
                  Student UIDs
                </label>
                <textarea
                  id="sync-uids"
                  className={clsx('form-control', errors.uids && 'is-invalid')}
                  rows={8}
                  placeholder="student1@example.com&#10;student2@example.com&#10;student3@example.com"
                  aria-invalid={!!errors.uids}
                  aria-errormessage={errors.uids ? 'sync-uids-error' : undefined}
                  aria-describedby="sync-uids-help"
                  {...register('uids', {
                    validate: validateUidsFormat,
                  })}
                />
                {errors.uids?.message && (
                  <div className="invalid-feedback" id="sync-uids-error">
                    {errors.uids.message}
                  </div>
                )}
                <div className="form-text" id="sync-uids-help">
                  One UID per line, or comma/space/semicolon separated.
                </div>
              </div>
            </form>

            {isUnpublished && (
              <Alert variant="warning" className="mb-0">
                Students will not be able to accept invitations until the course instance is
                published.
              </Alert>
            )}

            {courseInstance.self_enrollment_enabled && (
              <Alert variant="info" className="mb-0">
                Self-enrollment is enabled for this course instance. Removed students will be able
                to re-enroll themselves. Consider disabling self-enrollment if you want to prevent
                this.
              </Alert>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <>
            {hasNoChanges ? (
              <div className="text-center py-4">
                <i
                  className="bi bi-check-circle-fill text-success d-block mb-3"
                  style={{ fontSize: '3rem' }}
                  aria-hidden="true"
                />
                <p className="h4 mb-2">All synced!</p>
                <p className="text-muted mb-0">Your roster is already up to date.</p>
              </div>
            ) : (
              <>
                <p>Review the changes below. Uncheck any students you don't want to modify.</p>

                <div className="d-flex flex-column gap-5">
                  <StudentCheckboxList
                    items={preview.toInvite}
                    selectedUids={selectedInvites}
                    variant="invite"
                    onToggle={toggleInvite}
                    onSelectAll={() =>
                      setSelectedInvites(new Set(preview.toInvite.map((item) => item.uid)))
                    }
                    onDeselectAll={() => setSelectedInvites(new Set())}
                  />

                  <StudentCheckboxList
                    items={preview.toCancelInvitation}
                    selectedUids={selectedCancellations}
                    variant="cancel"
                    onToggle={toggleCancellation}
                    onSelectAll={() =>
                      setSelectedCancellations(
                        new Set(preview.toCancelInvitation.map((item) => item.uid)),
                      )
                    }
                    onDeselectAll={() => setSelectedCancellations(new Set())}
                  />

                  <StudentCheckboxList
                    items={preview.toRemove}
                    selectedUids={selectedRemovals}
                    variant="remove"
                    onToggle={toggleRemoval}
                    onSelectAll={() =>
                      setSelectedRemovals(new Set(preview.toRemove.map((item) => item.uid)))
                    }
                    onDeselectAll={() => setSelectedRemovals(new Set())}
                  />
                </div>
              </>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        {step === 'input' && (
          <>
            <Button variant="secondary" onClick={onHide}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onCompare}>
              Compare
            </Button>
          </>
        )}

        {step === 'preview' && (
          <div className="d-flex flex-column w-100 gap-3">
            {!hasNoChanges && !hasNoSelections && (
              <div className="d-flex align-items-center gap-3 small text-muted">
                <span className="fw-medium">Summary:</span>
                {summaryCounts.invitations > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-success"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.invitations} invitation
                    {summaryCounts.invitations === 1 ? '' : 's'}
                  </span>
                )}
                {summaryCounts.reEnrollments > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-success"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.reEnrollments} re-enrollment
                    {summaryCounts.reEnrollments === 1 ? '' : 's'}
                  </span>
                )}
                {summaryCounts.cancellations > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-warning"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.cancellations} cancellation
                    {summaryCounts.cancellations === 1 ? '' : 's'}
                  </span>
                )}
                {summaryCounts.removals > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-danger"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.removals} removal{summaryCounts.removals === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-secondary"
                disabled={syncMutation.isPending}
                onClick={() => setStep('input')}
              >
                Back
              </Button>
              <div className="ms-auto d-flex gap-2">
                {hasNoChanges ? (
                  <Button variant="primary" onClick={onHide}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" disabled={syncMutation.isPending} onClick={onHide}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      disabled={hasNoSelections || syncMutation.isPending}
                      onClick={() => syncMutation.mutate()}
                    >
                      {syncMutation.isPending
                        ? 'Syncing...'
                        : `Sync ${totalSelectedCount} student${totalSelectedCount === 1 ? '' : 's'}`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal.Footer>
    </Modal>
  );
}
