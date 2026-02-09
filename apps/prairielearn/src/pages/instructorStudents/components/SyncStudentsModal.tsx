import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { computeStatus } from '../../../lib/publishing.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import type { StudentRow } from '../instructorStudents.shared.js';

interface SyncStudentsForm {
  uids: string;
}

interface StudentSyncItem {
  uid: string;
  currentStatus: EnumEnrollmentStatus | null;
  enrollmentId: string | null;
  userName?: string | null;
}

interface SyncPreview {
  toInvite: StudentSyncItem[];
  toCancelInvitation: StudentSyncItem[];
  toRemove: StudentSyncItem[];
}

type SyncStep = 'input' | 'preview';

const MAX_UIDS = 5000;

/**
 * Computes the diff between the input roster and the current enrollments.
 *
 * Sync logic (roster is the source of truth):
 * - Students on roster but not `joined`/`invited`: should be invited or re-enrolled
 * - Students not on roster who are `joined`: should be removed
 * - Students not on roster who are `invited`/`rejected`: should have invitation cancelled
 * - Students already `joined` or `invited` who are on the roster: no action
 */
function computeSyncDiff(inputUids: string[], currentEnrollments: StudentRow[]): SyncPreview {
  const inputUidSet = new Set(inputUids);
  const currentUidMap = new Map<string, StudentRow>();

  // Build map of current enrollments (all statuses) by UID
  for (const student of currentEnrollments) {
    const uid = student.user?.uid ?? student.enrollment.pending_uid;
    if (uid) {
      currentUidMap.set(uid, student);
    }
  }

  const toInvite: StudentSyncItem[] = [];
  const toCancelInvitation: StudentSyncItem[] = [];
  const toRemove: StudentSyncItem[] = [];

  // Students on roster who need to be invited
  for (const uid of inputUids) {
    const existing = currentUidMap.get(uid);

    if (!existing) {
      // New student - needs invitation
      toInvite.push({
        uid,
        currentStatus: null,
        enrollmentId: null,
      });
    } else if (!['joined', 'invited'].includes(existing.enrollment.status)) {
      // Existing but not active - needs invitation or re-enrollment
      toInvite.push({
        uid: existing.user?.uid ?? existing.enrollment.pending_uid ?? uid,
        currentStatus: existing.enrollment.status,
        enrollmentId: existing.enrollment.id,
        userName: existing.user?.name,
      });
    }
    // else: already joined or invited - no action needed
  }

  // Students NOT on roster who should be removed or have invitation cancelled
  for (const student of currentUidMap.values()) {
    const uid = student.user?.uid ?? student.enrollment.pending_uid;
    if (uid && !inputUidSet.has(uid)) {
      const item: StudentSyncItem = {
        uid: student.user?.uid ?? student.enrollment.pending_uid!,
        currentStatus: student.enrollment.status,
        enrollmentId: student.enrollment.id,
        userName: student.user?.name,
      };

      // Invited/rejected students should have their invitation cancelled (deleted)
      // Joined students should be removed
      if (['invited', 'rejected'].includes(student.enrollment.status)) {
        toCancelInvitation.push(item);
      } else if (student.enrollment.status === 'joined') {
        toRemove.push(item);
      }
      // Other statuses (blocked, removed, lti13_pending) - no action needed
    }
  }

  return { toInvite, toCancelInvitation, toRemove };
}

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

            {isUnpublished && step === 'input' && (
              <Alert variant="warning" className="mb-0">
                Students will not be able to accept invitations until the course instance is
                published.
              </Alert>
            )}

            {courseInstance.self_enrollment_enabled && step === 'input' && (
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
