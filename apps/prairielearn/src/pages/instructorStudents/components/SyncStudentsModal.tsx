import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'preact/compat';
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
  toBlock: StudentSyncItem[];
}

type SyncStep = 'input' | 'preview' | 'submitting';

const MAX_UIDS = 1000;

/**
 * Computes the diff between the input roster and the current enrollments.
 *
 * Sync logic (roster is the source of truth):
 * - Students on roster but not `joined`/`invited` → should be invited
 * - Students not on roster (any enrollment status) → should be blocked
 * - Students already `joined` or `invited` who are on the roster → no action
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
  const toBlock: StudentSyncItem[] = [];

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
      // Existing but not active - needs re-invitation
      toInvite.push({
        uid: existing.user?.uid ?? existing.enrollment.pending_uid ?? uid,
        currentStatus: existing.enrollment.status,
        enrollmentId: existing.enrollment.id,
        userName: existing.user?.name,
      });
    }
    // else: already joined or invited - no action needed
  }

  // Students NOT on roster who should be blocked
  for (const [, student] of currentUidMap) {
    const uid = student.user?.uid ?? student.enrollment.pending_uid;
    if (uid && !inputUidSet.has(uid)) {
      // Not on roster - block if has any enrollment status
      toBlock.push({
        uid: student.user?.uid ?? student.enrollment.pending_uid!,
        currentStatus: student.enrollment.status,
        enrollmentId: student.enrollment.id,
        userName: student.user?.name,
      });
    }
  }

  return { toInvite, toBlock };
}

interface StudentCheckboxListProps {
  items: StudentSyncItem[];
  selectedUids: Set<string>;
  onToggle: (uid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  variant: 'invite' | 'block';
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

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0">
          {variant === 'invite' ? (
            <>
              <i className="bi bi-person-plus text-success me-2" aria-hidden="true" />
              Students to invite ({selectedCount} of {items.length} selected)
            </>
          ) : (
            <>
              <i className="bi bi-slash-circle text-danger me-2" aria-hidden="true" />
              Students to block ({selectedCount} of {items.length} selected)
            </>
          )}
        </h6>
        <div className="btn-group btn-group-sm">
          <Button variant="outline-secondary" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={onDeselectAll}>
            Clear
          </Button>
        </div>
      </div>

      {variant === 'block' && (
        <Alert variant="warning" className="py-2 mb-2">
          <small>
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
            Selected students will be blocked from accessing the course.
          </small>
        </Alert>
      )}

      <div
        className="border rounded"
        style={{ maxHeight: '200px', overflowY: 'auto' }}
        role="group"
        aria-label={`Students to ${variant}`}
      >
        {items.map((item, index) => (
          <div
            key={item.uid}
            className={clsx('px-3 py-2', index !== items.length - 1 && 'border-bottom')}
          >
            <Form.Check
              type="checkbox"
              id={`sync-${variant}-${item.uid}`}
              checked={selectedUids.has(item.uid)}
              className="mb-0"
              label={
                <span className="d-inline-flex align-items-center gap-2 flex-wrap">
                  <code>{item.uid}</code>
                  {item.userName && <span className="text-muted">({item.userName})</span>}
                  {item.currentStatus ? (
                    <EnrollmentStatusIcon status={item.currentStatus} type="badge" />
                  ) : (
                    <span className="badge bg-info">New</span>
                  )}
                </span>
              }
              onChange={() => onToggle(item.uid)}
            />
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
  onSubmit: (toInvite: string[], toBlock: string[]) => Promise<void>;
}) {
  const [step, setStep] = useState<SyncStep>('input');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(() => new Set());
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(() => new Set());

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
    setSelectedBlocks(new Set(diff.toBlock.map((item) => item.uid)));
    setStep('preview');
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const toInvite = Array.from(selectedInvites);
      const toBlock = Array.from(selectedBlocks);
      return onSubmit(toInvite, toBlock);
    },
    onMutate: () => {
      setStep('submitting');
    },
    onSuccess: onHide,
    onError: () => {
      setStep('preview');
    },
  });

  const resetModalState = () => {
    reset();
    clearErrors();
    setStep('input');
    setPreview(null);
    setSelectedInvites(new Set());
    setSelectedBlocks(new Set());
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

  const toggleBlock = (uid: string) => {
    setSelectedBlocks((prev) => {
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
    return preview.toInvite.length === 0 && preview.toBlock.length === 0;
  }, [preview]);

  const hasNoSelections = selectedInvites.size === 0 && selectedBlocks.size === 0;

  const isUnpublished =
    courseInstance.modern_publishing &&
    computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
      'published';

  return (
    <Modal show={show} backdrop="static" size="lg" onHide={onHide} onExited={resetModalState}>
      <Modal.Header closeButton>
        <Modal.Title>Sync students</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {isUnpublished && step === 'input' && (
          <Alert variant="warning">
            Students will not be able to accept invitations until the course instance is published.
          </Alert>
        )}

        {syncMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => syncMutation.reset()}>
            {syncMutation.error instanceof Error ? syncMutation.error.message : 'An error occurred'}
          </Alert>
        )}

        {step === 'input' && (
          <form onSubmit={onCompare}>
            <p className="text-muted">
              Paste your student roster below. Students on this list will be invited if not already
              enrolled. Students not on this list will be blocked.
            </p>
            <div className="mb-3">
              <label for="sync-uids" className="form-label">
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
        )}

        {step === 'preview' && preview && (
          <>
            {hasNoChanges ? (
              <Alert variant="success">
                <i className="bi bi-check-circle me-2" aria-hidden="true" />
                Your roster is already in sync! No changes are needed.
              </Alert>
            ) : (
              <>
                <p className="text-muted mb-3">
                  Review the changes below. Uncheck any students you don't want to modify.
                </p>

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
                  items={preview.toBlock}
                  selectedUids={selectedBlocks}
                  variant="block"
                  onToggle={toggleBlock}
                  onSelectAll={() =>
                    setSelectedBlocks(new Set(preview.toBlock.map((item) => item.uid)))
                  }
                  onDeselectAll={() => setSelectedBlocks(new Set())}
                />
              </>
            )}
          </>
        )}

        {step === 'submitting' && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Syncing...</span>
            </div>
            <p className="text-muted mb-0">Processing roster sync...</p>
          </div>
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
          <>
            <Button variant="outline-secondary" onClick={() => setStep('input')}>
              Back
            </Button>
            <Button variant="secondary" onClick={onHide}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={hasNoChanges || hasNoSelections}
              onClick={() => syncMutation.mutate()}
            >
              {hasNoChanges
                ? 'No changes'
                : `Sync ${selectedInvites.size + selectedBlocks.size} student${
                    selectedInvites.size + selectedBlocks.size === 1 ? '' : 's'
                  }`}
            </Button>
          </>
        )}

        {step === 'submitting' && (
          <Button variant="secondary" disabled>
            Processing...
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
