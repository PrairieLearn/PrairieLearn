import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { assertNever } from '@prairielearn/utils';

import { StudentCheckboxList } from '../../../components/StudentCheckboxList.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import type { StaffCourseInstance, StaffStudentLabel } from '../../../lib/client/safe-db-types.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { computeStatus } from '../../../lib/publishing.js';
import { parseUniqueValuesFromString } from '../../../lib/string-util.js';
import { useTRPC } from '../../../trpc/courseInstance/context.js';
import type { StudentSyncError } from '../../../trpc/courseInstance/student-sync.js';
import {
  MAX_SYNC_CSV_FILE_BYTES,
  MAX_SYNC_CSV_TEXT_LENGTH,
  type StudentRow,
  type SyncCsv,
} from '../instructorStudents.shared.js';

import { type StudentSyncItem, type SyncPreview, computeSyncDiff } from './sync-students-diff.js';

interface SyncStudentsForm {
  uids: string;
  format: 'uids' | 'csv-file';
  csvFile: FileList;
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
  selfEnrollLink,
  onHide,
  onSubmit,
}: {
  show: boolean;
  courseInstance: StaffCourseInstance;
  students: StudentRow[];
  selfEnrollLink: string;
  onHide: () => void;
  onSubmit: (
    toInvite: string[],
    toCancelInvitation: string[],
    toRemove: string[],
    csv?: SyncCsv,
  ) => Promise<void>;
}) {
  const trpc = useTRPC();
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [labels, setLabels] = useState<StaffStudentLabel[]>([]);
  const [selectedLabelUpdates, setSelectedLabelUpdates] = useState<Set<string>>(() => new Set());
  const [step, setStep] = useState<SyncStep>('input');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [selectedAdds, setSelectedAdds] = useState<Set<string>>(() => new Set());
  const [selectedRemovals, setSelectedRemovals] = useState<Set<string>>(() => new Set());

  const {
    register,
    handleSubmit,
    clearErrors,
    reset,
    resetField,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SyncStudentsForm>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: { uids: '', format: 'uids' },
  });

  const format = watch('format');
  const showPreview = (diff: SyncPreview) => {
    setPreview(diff);
    setSelectedAdds(new Set(diff.toInvite.map((item) => item.uid)));
    setSelectedRemovals(
      new Set([...diff.toCancelInvitation, ...diff.toRemove].map((item) => item.uid)),
    );
    setSelectedLabelUpdates(new Set(diff.toUpdateLabels.map((item) => item.uid)));
    setStep('preview');
  };
  const previewMutation = useMutation(
    trpc.studentSync.preview.mutationOptions({
      onSuccess: ({ preview, labels }, { text }) => {
        setPreviewText(text);
        setLabels(labels);
        showPreview(preview);
      },
    }),
  );
  const isComparing = isSubmitting || previewMutation.isPending;
  const previewError = getAppError<StudentSyncError['Preview']>(previewMutation.error);

  const validateUidsFormat = (value: string): string | true => {
    if (format === 'csv-file') return true;
    let uids: string[] = [];
    try {
      uids = parseUniqueValuesFromString(value, MAX_UIDS);
    } catch (error) {
      return error instanceof Error ? error.message : 'An error occurred';
    }

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidUids = uids.filter((uid) => !z.email().safeParse(uid).success);

    if (invalidUids.length > 0) {
      return `The following UIDs were invalid: "${invalidUids.join('", "')}"`;
    }

    return true;
  };

  const onCompare = handleSubmit(async ({ uids, csvFile, format }) => {
    switch (format) {
      case 'uids':
        setPreviewText(null);
        showPreview(computeSyncDiff(parseUniqueValuesFromString(uids, MAX_UIDS), students));
        break;
      case 'csv-file': {
        let text: string;
        try {
          text = await csvFile[0].text();
        } catch {
          setError('csvFile', { message: 'Could not read this file. Select the CSV file again.' });
          return;
        }
        if (text.trim() === '') {
          setError('csvFile', {
            message: 'This file is empty. Select a CSV file containing students.',
          });
          return;
        }
        if (text.length > MAX_SYNC_CSV_TEXT_LENGTH) {
          setError('csvFile', {
            message: 'This CSV exceeds the 1,000,000-character limit. Select a smaller file.',
          });
          return;
        }
        previewMutation.mutate({ text });
        break;
      }
      default:
        assertNever(format);
    }
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
      return onSubmit(
        toInvite,
        toCancelInvitation,
        toRemove,
        previewText !== null
          ? {
              text: previewText,
              labelUpdates: [
                ...preview.toInvite.filter((item) => selectedAdds.has(item.uid)),
                ...preview.toUpdateLabels.filter((item) => selectedLabelUpdates.has(item.uid)),
              ].flatMap((item) => (item.labelUpdate ? [item.labelUpdate] : [])),
            }
          : undefined,
      );
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
    setPreviewText(null);
    setSelectedAdds(new Set());
    setSelectedRemovals(new Set());
    syncMutation.reset();
    previewMutation.reset();
    setSelectedLabelUpdates(new Set());
    setLabels([]);
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
      preview.toRemove.length === 0 &&
      preview.toUpdateLabels.length === 0
    );
  }, [preview]);

  const allRemovals = useMemo(() => {
    if (!preview) return [];
    return [...preview.toCancelInvitation, ...preview.toRemove];
  }, [preview]);

  const totalSelectedCount = selectedAdds.size + selectedRemovals.size + selectedLabelUpdates.size;
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

  const renderLabelChanges = (item: StudentSyncItem) => {
    if (!item.labelUpdate) return null;
    const previous = new Set(item.labelUpdate.expected?.labelIds);
    const desired = new Set(item.labelUpdate.labelIds);
    return (
      <span className="d-flex flex-column gap-1 small text-break">
        {labels
          .filter((label) => desired.has(label.id) && !previous.has(label.id))
          .map((label) => (
            <span key={label.id} className="d-flex flex-wrap align-items-center gap-1">
              Add: <StudentLabelBadge label={label} />
            </span>
          ))}
        {labels
          .filter((label) => previous.has(label.id) && !desired.has(label.id))
          .map((label) => (
            <span key={label.id} className="d-flex flex-wrap align-items-center gap-1">
              Remove: <StudentLabelBadge label={label} />
            </span>
          ))}
      </span>
    );
  };

  const isUnpublished =
    courseInstance.modern_publishing &&
    computeStatus(courseInstance.publishing_start_date, courseInstance.publishing_end_date) !==
      'published';

  return (
    <Modal
      show={show}
      backdrop="static"
      keyboard={!isComparing && !syncMutation.isPending}
      size="lg"
      onHide={onHide}
      onExited={resetModalState}
    >
      <Modal.Header closeButton={!isComparing && !syncMutation.isPending}>
        <Modal.Title>Synchronize student list</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {syncMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => syncMutation.reset()}>
            {syncMutation.error instanceof Error ? syncMutation.error.message : 'An error occurred'}
          </Alert>
        )}

        {/* Keep the native file selection mounted when returning from the preview. */}
        <div hidden={step !== 'input'}>
          <div className="d-flex flex-column gap-3">
            <form onSubmit={onCompare}>
              <p>
                Upload a CSV file or paste a list of student UIDs below. Students on this list will
                be added to the course. Students not on this list will be removed.
              </p>
              <fieldset className="mb-3" disabled={isComparing}>
                <legend className="form-label fs-6">Input format</legend>
                {[
                  { value: 'uids', label: 'UID list' },
                  { value: 'csv-file', label: 'CSV file' },
                ].map(({ value, label }) => (
                  <Form.Check
                    key={value}
                    type="radio"
                    id={`sync-format-${value}`}
                    label={label}
                    value={value}
                    defaultChecked={value === 'uids'}
                    inline
                    {...register('format', {
                      onChange: () => {
                        resetField('csvFile');
                        clearErrors();
                        previewMutation.reset();
                      },
                    })}
                  />
                ))}
              </fieldset>
              {format === 'csv-file' && (
                <div className="mb-3">
                  <p>
                    Use one row per student. In the labels column, enter a JSON array of label
                    names, such as <code>["Section A", "Extra time"]</code>. Labels must already
                    exist in this course instance. Spreadsheet CSV exports escape the quotation
                    marks as shown below.
                  </p>
                  <pre className="bg-body-tertiary p-2" style={{ whiteSpace: 'pre-wrap' }}>
                    {
                      'uid,labels\nadam@example.com,"[""Section 1"", ""Arts""]"\nben@example.com,"[""Section 1"", ""Science""]"'
                    }
                  </pre>
                  <p className="mb-0">
                    The labels column replaces each student's labels. Include every label to retain.
                    An empty cell or <code>[]</code> clears labels. Omit the labels column to
                    preserve existing labels.
                  </p>
                </div>
              )}
              <div>
                {format === 'csv-file' ? (
                  <Form.Group controlId="sync-csv-file">
                    <Form.Label>Choose CSV file</Form.Label>
                    <Form.Control
                      type="file"
                      accept=".csv"
                      disabled={isComparing}
                      isInvalid={!!errors.csvFile || !!previewError}
                      aria-invalid={!!errors.csvFile || !!previewError}
                      aria-errormessage={
                        errors.csvFile || previewError ? 'sync-file-error' : undefined
                      }
                      aria-describedby="sync-file-help"
                      {...register('csvFile', {
                        validate: (files) => {
                          const file = files.item(0);
                          if (!file) return 'Select a CSV file.';
                          return (
                            file.size <= MAX_SYNC_CSV_FILE_BYTES ||
                            'This file exceeds the 3 MB limit. Select a smaller CSV file.'
                          );
                        },
                        onChange: () => {
                          clearErrors('csvFile');
                          previewMutation.reset();
                        },
                      })}
                    />
                    <Form.Text id="sync-file-help">
                      Choose a CSV saved with UTF-8 encoding, such as Excel’s CSV UTF-8 format.
                      Maximum file size: 3 MB.
                    </Form.Text>
                    {errors.csvFile?.message && (
                      <Form.Control.Feedback type="invalid" id="sync-file-error">
                        {errors.csvFile.message}
                      </Form.Control.Feedback>
                    )}
                    {previewError && !errors.csvFile && (
                      <div id="sync-file-error" className="mt-2">
                        <AppErrorAlert
                          error={previewError}
                          render={{ UNKNOWN: ({ message }) => message }}
                        />
                      </div>
                    )}
                  </Form.Group>
                ) : (
                  <>
                    <label htmlFor="sync-uids" className="form-label">
                      Student UIDs
                    </label>
                    <textarea
                      id="sync-uids"
                      className={clsx('form-control', errors.uids && 'is-invalid')}
                      rows={8}
                      defaultValue=""
                      disabled={isComparing}
                      placeholder={'student1@example.com\nstudent2@example.com'}
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
                  </>
                )}
                <div className="form-text" id="sync-uids-help">
                  {format === 'uids' && 'One UID per line, or comma/space/semicolon separated. '}
                  Students are not notified about the invitation: you must instruct them to visit{' '}
                  <a href="/" target="_blank" rel="noopener noreferrer">
                    the PrairieLearn homepage
                  </a>{' '}
                  or{' '}
                  <a href={selfEnrollLink} target="_blank" rel="noopener noreferrer">
                    the course instance enrollment link
                  </a>{' '}
                  to accept the invitation.
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
        </div>

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
                    renderItemExtra={(item) => (
                      <>
                        {renderSyncItemBadge(item)}
                        {renderLabelChanges(item)}
                      </>
                    )}
                    onToggle={toggleAdd}
                    onSelectAll={() =>
                      setSelectedAdds(new Set(preview.toInvite.map((item) => item.uid)))
                    }
                    onDeselectAll={() => setSelectedAdds(new Set())}
                  />
                )}

                {preview.toUpdateLabels.length > 0 && (
                  <StudentCheckboxList
                    items={preview.toUpdateLabels}
                    selectedUids={selectedLabelUpdates}
                    icon="bi-tags"
                    iconColor="text-primary"
                    iconBg="bg-primary-subtle"
                    label="Students with label changes"
                    description="These students will keep their current enrollment status."
                    checkboxIdPrefix="sync-labels"
                    renderItemExtra={renderLabelChanges}
                    onToggle={(uid) =>
                      setSelectedLabelUpdates((previous) => {
                        const next = new Set(previous);
                        if (next.has(uid)) next.delete(uid);
                        else next.add(uid);
                        return next;
                      })
                    }
                    onSelectAll={() =>
                      setSelectedLabelUpdates(
                        new Set(preview.toUpdateLabels.map((item) => item.uid)),
                      )
                    }
                    onDeselectAll={() => setSelectedLabelUpdates(new Set())}
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
            <Button variant="secondary" disabled={isComparing} onClick={onHide}>
              Cancel
            </Button>
            <Button variant="primary" disabled={isComparing} onClick={onCompare}>
              {isComparing ? 'Comparing...' : 'Compare'}
            </Button>
          </>
        )}

        {step === 'preview' && (
          <div className="d-flex flex-column w-100 gap-3">
            {!hasNoChanges && !hasNoSelections && (
              <div className="d-flex flex-wrap align-items-center gap-3 small text-muted">
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
                {selectedLabelUpdates.size > 0 && (
                  <span>{selectedLabelUpdates.size} labels updated</span>
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
