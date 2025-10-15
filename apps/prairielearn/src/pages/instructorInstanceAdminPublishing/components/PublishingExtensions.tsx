import { useState } from 'preact/compat';
import { Alert, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

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
  onSubmit,
  isSubmitting,
  mode,
  mainArchiveDate,
  courseInstanceTimezone,
}: {
  show: boolean;
  defaultValues: ExtensionFormValues;
  currentArchiveText: string;
  isSubmitting: boolean;
  onHide: () => void;
  onSubmit: (values: ExtensionFormValues) => Promise<void>;
  mode: 'add' | 'edit';
  mainArchiveDate: Date | null;
  courseInstanceTimezone: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setError,
  } = useForm<ExtensionFormValues>({
    values: defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  return (
    <Modal show={show} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{mode === 'add' ? 'Add Extension' : 'Edit Extension'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit(async (data, event) => {
          event.preventDefault();
          try {
            await onSubmit(data);
          } catch (error) {
            // errors with root as the key will not persist with each submission
            setError('root.serverError', {
              message: error instanceof Error ? error.message : 'Unknown error',
            });
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
            <input
              id="ext-date"
              type="datetime-local"
              step="1"
              class="form-control"
              {...register('archive_date', {
                required: 'Archive date is required',
                validate: (value) => {
                  if (mode === 'add') return true;
                  if (!mainArchiveDate) return true;
                  const enteredDate = plainDateTimeStringToDate(value, courseInstanceTimezone);
                  return (
                    enteredDate > mainArchiveDate ||
                    'Archive date must be after the course archive date'
                  );
                },
              })}
            />
            {errors.archive_date && (
              <div class="text-danger small">{String(errors.archive_date.message)}</div>
            )}
            <small class="text-muted">Current course archive date: {currentArchiveText}</small>
          </div>
          {errors.root?.serverError && (
            <div class="alert alert-danger" role="alert">
              {errors.root.serverError.message}
            </div>
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
              {...register('uids', { required: 'UIDs are required' })}
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
          <button type="submit" class="btn btn-primary" disabled={isSubmitting || !isValid}>
            Save
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
        ? DateToPlainDateTimeString(courseInstance.publishing_archive_date, courseInstance.display_timezone)
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
      archive_date: DateToPlainDateTimeString(extension.archive_date, courseInstance.display_timezone),
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

  const submitAdd = async (values: ExtensionFormValues) => {
    if (!values.archive_date.trim() || !values.uids.trim()) {
      throw new Error('Archive date and UIDs are required');
    }
    setIsSubmitting(true);
    try {
      const body = {
        __csrf_token: csrfToken,
        __action: 'add_extension',
        name: values.name.trim(),
        archive_date: values.archive_date,
        uids: values.uids.trim(),
      };
      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create extension');
      }
      window.location.reload();
    } catch (err) {
      console.error('Error creating extension:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEdit = async (values: ExtensionFormValues) => {
    if (!values.archive_date.trim() || !values.uids.trim()) {
      throw new Error('Archive date and UIDs are required');
    }
    if (!editExtensionId) {
      throw new Error('Extension ID is missing');
    }
    setIsSubmitting(true);
    try {
      const body = {
        __csrf_token: csrfToken,
        __action: 'edit_extension',
        extension_id: editExtensionId,
        name: values.name.trim(),
        archive_date: values.archive_date,
        uids: values.uids.trim(),
      };
      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to edit extension');
      }
      window.location.reload();
    } catch (err) {
      console.error('Error editing extension:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
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
          isSubmitting={isSubmitting}
          mode={shownModalMode}
          mainArchiveDate={courseInstance.publishing_archive_date}
          courseInstanceTimezone={courseInstance.display_timezone}
          onHide={closeModal}
          onSubmit={shownModalMode === 'add' ? submitAdd : submitEdit}
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
        <span>
          {formatDateFriendly(extension.archive_date, timeZone)}
          {isBeforeInstanceArchiveDate && (
            <>
              {' '}
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id={`ignored-date-${extension.id}`}>
                    Warning: This date will be ignored
                  </Tooltip>
                }
              >
                <i
                  class="fas fa-exclamation-triangle text-warning"
                  aria-label="Warning: This date will be ignored"
                />
              </OverlayTrigger>
            </>
          )}
        </span>
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
