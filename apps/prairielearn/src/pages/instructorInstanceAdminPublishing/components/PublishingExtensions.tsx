import { Temporal } from '@js-temporal/polyfill';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { formatDateFriendly } from '@prairielearn/formatter';

import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-publishing-extensions.types.js';
import { DateToPlainDateTimeString, plainDateTimeStringToDate } from '../utils/dateUtils.js';

interface PublishingExtensionsProps {
  courseInstance: StaffCourseInstance;
  extensions: CourseInstancePublishingExtensionWithUsers[];
  canEdit: boolean;
  csrfToken: string;
}

interface ExtensionFormValues {
  name: string;
  archive_date: string;
  uids: string;
}

function ExtensionModal({
  show,
  defaultValues,
  currentArchiveText,
  onHide,
  mode,
  mainArchiveDate,
  courseInstanceTimezone,
  csrfToken,
  editExtensionId,
}: {
  show: boolean;
  defaultValues: ExtensionFormValues;
  currentArchiveText: string;
  onHide: () => void;
  mode: 'add' | 'edit';
  mainArchiveDate: Date | null;
  courseInstanceTimezone: string;
  csrfToken: string;
  editExtensionId: string | null;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bypassEnrollmentCheck, setBypassEnrollmentCheck] = useState(false);

  const someInvalidUidsPrefix = 'The following UIDs were invalid';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ExtensionFormValues>({
    values: defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const currentArchiveDate = watch('archive_date');

  const handleAddWeek = async () => {
    const currentDate = Temporal.PlainDateTime.from(currentArchiveDate);
    const newValue = currentDate.add({ weeks: 1 });
    setValue('archive_date', newValue.toString());
    await trigger('archive_date');
  };

  const validateEmails = async (value: string) => {
    const uids = value
      .split(/[\n,]+/)
      .map((uid) => uid.trim())
      .filter((uid) => uid.length > 0);

    if (uids.length === 0) {
      return 'At least one UID is required';
    }

    const invalidEmails = uids.filter((uid) => !z.string().email().safeParse(uid).success);

    if (invalidEmails.length > 0) {
      // You can't return errors with a type from validate, so we will use a constant string prefix.
      return `${someInvalidUidsPrefix}: "${invalidEmails.join('", "')}"`;
    }

    const params = new URLSearchParams();
    params.append('uids', uids.join(','));
    const resp = await fetch(`${window.location.pathname}/extension/check?${params.toString()}`);
    if (!resp.ok) return 'Failed to validate UIDs';

    const { success, data } = z
      .object({ invalidUids: z.array(z.string()) })
      .safeParse(await resp.json());
    if (!success) return 'Failed to check UIDs';

    const validCount = uids.length - data.invalidUids.length;
    if (validCount < 1) {
      return 'At least one of the UIDs must be enrolled';
    }

    // We can bypass this final check if needed
    if (bypassEnrollmentCheck) return true;

    if (data.invalidUids.length > 0) {
      return `Not enrolled: "${data.invalidUids.join('", ')}". If you hit "Save Anyway", these users will be ignored.`;
    }
    return true;
  };

  return (
    <Modal show={show} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{mode === 'add' ? 'Add Extension' : 'Edit Extension'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit(async (data, event) => {
          event.preventDefault();
          setErrorMessage(null);
          try {
            const body = {
              __csrf_token: csrfToken,
              __action: editExtensionId ? 'edit_extension' : 'add_extension',
              name: data.name.trim(),
              archive_date: data.archive_date,
              extension_id: editExtensionId,
              uids: data.uids.trim(),
            };
            const resp = await fetch(window.location.pathname, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!resp.ok) {
              const data = await resp.json().catch(() => ({}));
              setErrorMessage(data.message || 'Failed to save extension');
            }
            // On success, reload the page
            window.location.reload();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
          }
        })}
      >
        <Modal.Body>
          <div class="mb-3">
            <label class="form-label" for="ext-name">
              Extension name (optional)
            </label>
            <input id="ext-name" type="text" class="form-control" {...register('name')} />
          </div>
          <div class="mb-3">
            <label class="form-label" for="ext-date">
              Archive date
            </label>
            <div class="input-group">
              <input
                id="ext-date"
                type="datetime-local"
                step="1"
                class="form-control"
                {...register('archive_date', {
                  required: 'Archive date is required',
                  validate: (value) => {
                    if (!mainArchiveDate) return true;
                    const enteredDate = plainDateTimeStringToDate(value, courseInstanceTimezone);
                    // edit mode has no validation on the archive date
                    return (
                      mode === 'edit' ||
                      enteredDate > mainArchiveDate ||
                      'Archive date must be after the course archive date'
                    );
                  },
                })}
              />
              <button
                type="button"
                class={clsx('btn btn-outline-secondary', !currentArchiveDate && 'disabled')}
                onClick={handleAddWeek}
              >
                +1 week
              </button>
            </div>
            {errors.archive_date && (
              <div class="text-danger small">{String(errors.archive_date.message)}</div>
            )}
            <small class="text-muted">Current course archive date: {currentArchiveText}</small>
          </div>
          {errorMessage && (
            <Alert variant="danger" dismissible onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}
          <div class="mb-0">
            <label class="form-label" for="ext-uids">
              UIDs{mode === 'edit' ? ' (replaces entire list)' : ''}
            </label>
            <textarea
              id="ext-uids"
              class="form-control"
              rows={5}
              placeholder="One UID per line, or comma/space separated"
              {...register('uids', {
                validate: validateEmails,
                onChange: () => setBypassEnrollmentCheck(false),
              })}
            />
            {errors.uids && <div class="text-danger small">{String(errors.uids.message)}</div>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={isSubmitting}
            onClick={onHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={isSubmitting}
            onClick={() => {
              // You can't return errors with a type from validate, so we will use a constant string prefix.
              if (errors.uids?.message?.startsWith(someInvalidUidsPrefix)) {
                setBypassEnrollmentCheck(true);
              }
            }}
          >
            {errors.uids?.message?.startsWith(someInvalidUidsPrefix) ? 'Continue Anyway' : 'Save'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export function PublishingExtensions({
  courseInstance,
  extensions,
  canEdit,
  csrfToken,
}: PublishingExtensionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A set of extension IDs that are showing all students
  const [showAllStudents, setShowAllStudents] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [shownModalMode, setShownModalMode] = useState<'add' | 'edit' | null>(null);
  const [modalDefaults, setModalDefaults] = useState<ExtensionFormValues>({
    name: '',
    archive_date: '',
    uids: '',
  });
  const [editExtensionId, setEditExtensionId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteState, setDeleteState] = useState<
    { show: false } | { show: true; extensionId: string; extensionName: string }
  >({ show: false });

  const currentInstanceArchiveDate = courseInstance.publishing_archive_date
    ? formatDateFriendly(courseInstance.publishing_archive_date, courseInstance.display_timezone)
    : '—';

  const openAddModal = () => {
    setShownModalMode('add');
    setEditExtensionId(null);
    setModalDefaults({
      name: '',
      archive_date: courseInstance.publishing_archive_date
        ? DateToPlainDateTimeString(
            courseInstance.publishing_archive_date,
            courseInstance.display_timezone,
          )
        : '',
      uids: '',
    });
    setErrorMessage(null);
  };

  const openEditModal = (extension: CourseInstancePublishingExtensionWithUsers) => {
    setShownModalMode('edit');
    setEditExtensionId(extension.id);
    setModalDefaults({
      name: extension.name ?? '',
      archive_date: DateToPlainDateTimeString(
        extension.archive_date,
        courseInstance.display_timezone,
      ),
      uids: extension.user_data
        .map((u) => u.uid)
        .sort()
        .join('\n'),
    });
    setErrorMessage(null);
  };

  const closeModal = () => {
    setShownModalMode(null);
    setEditExtensionId(null);
    setModalDefaults({ name: '', archive_date: '', uids: '' });
  };

  const openDeleteModal = (extension: CourseInstancePublishingExtensionWithUsers) => {
    setDeleteState({
      show: true,
      extensionId: extension.id,
      extensionName: extension.name || 'Unnamed',
    });
  };

  const closeDeleteModal = () => setDeleteState({ show: false });

  const confirmDelete = async () => {
    if (!deleteState.show) return;
    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'delete_extension',
        extension_id: deleteState.extensionId,
      };
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error('Failed to delete extension');
      window.location.reload();
    } catch (error) {
      console.error('Error deleting extension:', error);
      setErrorMessage('Failed to delete extension. Please try again.');
    } finally {
      setIsSubmitting(false);
      closeDeleteModal();
    }
  };

  return (
    <>
      <div class="mb-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h5 class="mb-0">Extensions</h5>
          {canEdit && (
            <button
              type="button"
              class="btn btn-outline-primary btn-sm text-nowrap"
              disabled={isSubmitting}
              onClick={openAddModal}
            >
              Add Extension
            </button>
          )}
        </div>
        <small class="text-muted">
          Extend access to specific users beyond the original archive date. If multiple extensions
          apply to a user, the latest extension date will take effect. If an extension is before the
          archive date, it will be ignored.
        </small>
      </div>

      {extensions.length === 0 && (
        <div class="text-center text-muted mb-3">
          <p class="mb-0">No extensions configured.</p>
        </div>
      )}
      {errorMessage && (
        <Alert variant="danger" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
      {extensions.length > 0 && (
        <div class="table-responsive">
          <table class="table table-striped">
            <thead>
              <tr>
                <th class="col-1">Extension Name</th>
                <th class="col-1">Archive Date</th>
                <th class="col-3">Students</th>
                <th class="col-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {extensions.map((extension, idx) => (
                <ExtensionTableRow
                  key={extension.id}
                  idx={idx}
                  extension={extension}
                  courseInstance={courseInstance}
                  timeZone={courseInstance.display_timezone}
                  canEdit={canEdit}
                  isSubmitting={isSubmitting}
                  courseInstanceArchiveDate={courseInstance.publishing_archive_date}
                  showAllStudents={showAllStudents}
                  onToggleShowAllStudents={(id) => {
                    setShowAllStudents((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onEditExtension={openEditModal}
                  onDelete={openDeleteModal}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shownModalMode !== null && (
        <ExtensionModal
          show={true}
          defaultValues={modalDefaults}
          currentArchiveText={currentInstanceArchiveDate}
          mode={shownModalMode}
          mainArchiveDate={courseInstance.publishing_archive_date}
          courseInstanceTimezone={courseInstance.display_timezone}
          csrfToken={csrfToken}
          editExtensionId={editExtensionId}
          onHide={closeModal}
        />
      )}

      {deleteState.show && (
        <Modal backdrop="static" show onHide={closeDeleteModal}>
          <Modal.Header closeButton>
            <Modal.Title>Delete Extension</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Are you sure you want to delete extension "{deleteState.extensionName}"?
          </Modal.Body>
          <Modal.Footer>
            <button
              type="button"
              class="btn btn-outline-secondary"
              disabled={isSubmitting}
              onClick={closeDeleteModal}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-danger"
              disabled={isSubmitting}
              onClick={confirmDelete}
            >
              Delete
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}

function ExtensionTableRow({
  idx: _idx,
  extension,
  courseInstance,
  timeZone,
  canEdit,
  onDelete,
  isSubmitting,
  courseInstanceArchiveDate,
  showAllStudents,
  onToggleShowAllStudents,
  onEditExtension,
}: {
  idx: number;
  extension: CourseInstancePublishingExtensionWithUsers;
  courseInstance: StaffCourseInstance;
  timeZone: string;
  canEdit: boolean;
  onDelete: (extension: CourseInstancePublishingExtensionWithUsers) => void;
  isSubmitting: boolean;
  courseInstanceArchiveDate: Date | null;
  showAllStudents: Set<string>;
  onToggleShowAllStudents: (extensionId: string) => void;
  onEditExtension: (extension: CourseInstancePublishingExtensionWithUsers) => void;
}) {
  // Check if extension archive date is before the course instance archive date
  const isBeforeInstanceArchiveDate =
    courseInstanceArchiveDate && extension.archive_date < courseInstanceArchiveDate;

  return (
    <tr>
      <td class="col-1">
        {extension.name ? (
          <strong>{extension.name}</strong>
        ) : (
          <span class="text-muted">Unnamed</span>
        )}
      </td>
      <td class="col-1">
        {isBeforeInstanceArchiveDate ? (
          <span
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            title="This date is before the course instance archive date and will be ignored"
          >
            {formatDateFriendly(extension.archive_date, timeZone)}
            <i class="fas fa-exclamation-triangle text-warning" aria-hidden="true" />
          </span>
        ) : (
          <span>{formatDateFriendly(extension.archive_date, timeZone)}</span>
        )}
      </td>
      <td class="col-3">
        <div>
          {(() => {
            const isShowingAll = showAllStudents.has(extension.id);
            const studentsToShow = isShowingAll
              ? extension.user_data
              : extension.user_data.slice(0, 3);
            const hasMoreStudents = extension.user_data.length > 3;

            return (
              <>
                {extension.user_data.length > 0 && (
                  <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                    {studentsToShow.map(
                      (user: { uid: string; name: string | null; enrollment_id: string }) => (
                        <div key={user.uid} class="d-flex align-items-center gap-1">
                          <a
                            href={getStudentEnrollmentUrl(
                              `/pl/course_instance/${courseInstance.id}/instructor`,
                              user.enrollment_id,
                            )}
                            class="text-decoration-none"
                          >
                            {user.name || '—'}
                          </a>
                        </div>
                      ),
                    )}
                    {hasMoreStudents && (
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        onClick={() => onToggleShowAllStudents(extension.id)}
                      >
                        {isShowingAll ? (
                          <>
                            <i class="fas fa-chevron-up" aria-hidden="true" /> Show Less
                          </>
                        ) : (
                          <>
                            <i class="fas fa-chevron-down" aria-hidden="true" /> +
                            {extension.user_data.length - 3} More
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </td>
      <td class="col-1">
        <div class="d-flex gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                disabled={isSubmitting}
                onClick={() => onEditExtension(extension)}
              >
                Edit
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                disabled={isSubmitting}
                onClick={() => onDelete(extension)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
