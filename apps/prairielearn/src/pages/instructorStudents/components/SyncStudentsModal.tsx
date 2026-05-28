import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { assertNever } from '@prairielearn/utils';

import { StudentCheckboxList } from '../../../components/StudentCheckboxList.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { computeStatus } from '../../../lib/publishing.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import type { StudentRow } from '../instructorStudents.shared.js';

import { type StudentSyncItem, type SyncPreview, computeSyncDiff } from './sync-students-diff.js';

interface SyncStudentsForm {
  uids: string;
}

type SyncStep = 'input' | 'preview';

const MAX_UIDS = 5000;

function getCurrentStatusLabel(status: EnumEnrollmentStatus): string {
  switch (status) {
    case 'invited':
      return 'Currently invited';
    case 'joined':
      return 'Currently joined';
    case 'blocked':
      return 'Currently blocked';
    case 'removed':
      return 'Currently removed';
    case 'rejected':
      return 'Currently rejected';
    case 'left':
      return 'Currently left';
    case 'lti13_pending':
      return 'Currently invited via LTI';
    default:
      assertNever(status);
  }
}

function renderSyncItemBadge(item: StudentSyncItem) {
  return (
    <span className="badge rounded-pill bg-light text-body border">
      {item.currentStatus ? getCurrentStatusLabel(item.currentStatus) : 'New'}
    </span>
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
  const [selectedAdds, setSelectedAdds] = useState<Set<string>>(() => new Set());
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
    setSelectedAdds(new Set(diff.toInvite.map((item) => item.uid)));
    setSelectedRemovals(
      new Set([
        ...diff.toCancelInvitation.map((item) => item.uid),
        ...diff.toRemove.map((item) => item.uid),
      ]),
    );
    setStep('preview');
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const toInvite = Array.from(selectedAdds);
      const cancellationUids = new Set(preview.toCancelInvitation.map((item) => item.uid));
      const toCancelInvitation = Array.from(selectedRemovals).filter((uid) =>
        cancellationUids.has(uid),
      );
      const toRemove = Array.from(selectedRemovals).filter((uid) => !cancellationUids.has(uid));
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
    setSelectedAdds(new Set());
    setSelectedRemovals(new Set());
    syncMutation.reset();
  };

  const toggleAdd = (uid: string) => {
    setSelectedAdds((prev) => {
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

  const allRemovals = useMemo(() => {
    if (!preview) return [];
    return [...preview.toCancelInvitation, ...preview.toRemove];
  }, [preview]);

  const totalSelectedCount = selectedAdds.size + selectedRemovals.size;
  const hasNoSelections = totalSelectedCount === 0;

  const summaryCounts = useMemo(() => {
    if (!preview) {
      return { added: 0, removed: 0, unchanged: 0 };
    }
    return {
      added: selectedAdds.size,
      removed: selectedRemovals.size,
      unchanged: preview.unchangedCount,
    };
  }, [preview, selectedAdds.size, selectedRemovals.size]);

  const isUnpublished =
    courseInstance.modern_publishing &&
    computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
      'published';

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Synchronize student list</Modal.Title>
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
                Paste your student list below. Students on this list will be added to the course.
                Students not on this list will be removed.
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
                <p className="text-muted mb-0">Your student list is already up to date.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-4">
                <p className="mb-0">
                  Review the changes below. Uncheck any students you don't want to modify.
                </p>

                {preview.toInvite.length > 0 && (
                  <StudentCheckboxList
                    items={preview.toInvite}
                    selectedUids={selectedAdds}
                    icon="bi-person-plus"
                    iconColor="text-success"
                    iconBg="bg-success-subtle"
                    label="Students to add"
                    description="New students will be invited. Blocked or removed students will be re-enrolled."
                    checkboxIdPrefix="sync-add"
                    renderItemExtra={renderSyncItemBadge}
                    onToggle={toggleAdd}
                    onSelectAll={() =>
                      setSelectedAdds(new Set(preview.toInvite.map((item) => item.uid)))
                    }
                    onDeselectAll={() => setSelectedAdds(new Set())}
                  />
                )}

                {allRemovals.length > 0 && (
                  <StudentCheckboxList
                    items={allRemovals}
                    selectedUids={selectedRemovals}
                    icon="bi-person-dash"
                    iconColor="text-danger"
                    iconBg="bg-danger-subtle"
                    label="Students to remove"
                    description="Joined students will be removed. Pending invitations will be cancelled."
                    checkboxIdPrefix="sync-remove"
                    renderItemExtra={renderSyncItemBadge}
                    onToggle={toggleRemoval}
                    onSelectAll={() =>
                      setSelectedRemovals(new Set(allRemovals.map((item) => item.uid)))
                    }
                    onDeselectAll={() => setSelectedRemovals(new Set())}
                  />
                )}
              </div>
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
                {summaryCounts.added > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-success"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.added} added
                  </span>
                )}
                {summaryCounts.removed > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-danger"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.removed} removed
                  </span>
                )}
                {summaryCounts.unchanged > 0 && (
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-secondary"
                      style={{ width: '0.5rem', height: '0.5rem' }}
                      aria-hidden="true"
                    />
                    {summaryCounts.unchanged} unchanged
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
                <i className="bi bi-arrow-left" aria-hidden="true" /> Back
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
                        ? 'Updating...'
                        : `Update ${totalSelectedCount} student${totalSelectedCount === 1 ? '' : 's'}`}
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
