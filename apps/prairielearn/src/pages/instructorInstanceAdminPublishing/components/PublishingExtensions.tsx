import { Temporal } from '@js-temporal/polyfill';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { formatDateFriendly } from '@prairielearn/formatter';

import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import {
  type CourseInstancePublishingExtensionWithUsers,
  CourseInstancePublishingExtensionWithUsersSchema,
} from '../../../models/course-instance-publishing-extensions.types.js';
import { DateToPlainDateTime, plainDateTimeStringToDate } from '../utils/dateUtils.js';

interface PublishingExtensionsProps {
  courseInstance: StaffCourseInstance;
  initialExtensions: CourseInstancePublishingExtensionWithUsers[];
  canEdit: boolean;
  csrfToken: string;
  hasSaved: boolean;
}

interface ExtensionFormValues {
  name: string;
  end_date: string;
  uids: string;
}

function ExtensionModal({
  show,
  defaultValues,
  currentUnpublishText,
  onHide,
  mode,
  mainEndDate,
  courseInstanceTimezone,
  csrfToken,
  editExtensionId,
  onSaveSuccess,
}: {
  show: boolean;
  defaultValues: ExtensionFormValues;
  currentUnpublishText: string;
  onHide: () => void;
  mode: 'add' | 'edit';
  mainEndDate: Date | null;
  courseInstanceTimezone: string;
  csrfToken: string;
  editExtensionId: string | null;
  onSaveSuccess: () => void;
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
    formState: { errors },
  } = useForm<ExtensionFormValues>({
    values: defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const currentEndDate = watch('end_date');

  const handleAddWeek = async () => {
    const currentDate = Temporal.PlainDateTime.from(currentEndDate);
    const newValue = currentDate.add({ weeks: 1 });
    setValue('end_date', newValue.toString());
    await trigger('end_date');
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

  const saveMutation = useMutation({
    mutationFn: async (data: ExtensionFormValues) => {
      const body = {
        __csrf_token: csrfToken,
        __action: editExtensionId ? 'edit_extension' : 'add_extension',
        name: data.name.trim(),
        end_date: data.end_date,
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
        throw new Error(data.message || 'Failed to save extension');
      }
    },
    onSuccess: () => {
      onSaveSuccess();
      onHide();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    },
  });

  return (
    <Modal show={show} backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{mode === 'add' ? 'Add Extension' : 'Edit Extension'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((data, event) => {
          event?.preventDefault();
          setErrorMessage(null);
          void saveMutation.mutate(data);
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
              End date
            </label>
            <div class="input-group">
              <input
                id="ext-date"
                type="datetime-local"
                step="1"
                class="form-control"
                {...register('end_date', {
                  required: 'End date is required',
                  validate: (value) => {
                    if (!mainEndDate) return true;
                    const enteredDate = plainDateTimeStringToDate(value, courseInstanceTimezone);
                    // edit mode has no validation on the end date
                    return (
                      mode === 'edit' ||
                      enteredDate > mainEndDate ||
                      'End date must be after the course end date'
                    );
                  },
                })}
              />
              <button
                type="button"
                class={clsx('btn btn-outline-secondary', !currentEndDate && 'disabled')}
                onClick={handleAddWeek}
              >
                +1 week
              </button>
            </div>
            {errors.end_date && (
              <div class="text-danger small">{String(errors.end_date.message)}</div>
            )}
            <small class="text-muted">Current course end date: {currentUnpublishText}</small>
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
            disabled={saveMutation.isPending}
            onClick={onHide}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={saveMutation.isPending}
            onClick={() => {
              // You can't return errors with a type from validate, so we will use a constant string prefix.
              if (errors.uids?.message?.startsWith(someInvalidUidsPrefix)) {
                setBypassEnrollmentCheck(true);
              }
            }}
          >
            {saveMutation.isPending
              ? 'Saving...'
              : errors.uids?.message?.startsWith(someInvalidUidsPrefix)
                ? 'Continue Anyway'
                : 'Save'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export function PublishingExtensions({
  courseInstance,
  initialExtensions,
  canEdit,
  csrfToken,
  hasSaved,
}: PublishingExtensionsProps) {
  const queryClient = useQueryClient();

  const { data: extensions } = useQuery<CourseInstancePublishingExtensionWithUsers[]>({
    queryKey: ['extensions'],
    queryFn: async () => {
      const res = await fetch(window.location.pathname + '/extension/data.json');
      if (!res.ok) throw new Error('Failed to fetch extensions');
      const data = await res.json();
      const parsedData = z.array(CourseInstancePublishingExtensionWithUsersSchema).safeParse(data);
      if (!parsedData.success) throw new Error('Failed to parse extensions');
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData: initialExtensions,
  });

  // A set of extension IDs that are showing all students
  const [showAllStudents, setShowAllStudents] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [shownModalMode, setShownModalMode] = useState<'add' | 'edit' | null>(null);
  const [modalDefaults, setModalDefaults] = useState<ExtensionFormValues>({
    name: '',
    end_date: '',
    uids: '',
  });
  const [editExtensionId, setEditExtensionId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteState, setDeleteState] = useState<
    | { show: false }
    | {
        show: true;
        extensionId: string;
        extensionName: string | null;
        userData: { uid: string; name: string | null; enrollment_id: string }[];
      }
  >({ show: false });

  const currentInstanceEndDate = courseInstance.publishing_end_date
    ? formatDateFriendly(courseInstance.publishing_end_date, courseInstance.display_timezone)
    : '—';

  const openAddModal = () => {
    setShownModalMode('add');
    setEditExtensionId(null);
    setModalDefaults({
      name: '',
      end_date: courseInstance.publishing_end_date
        ? DateToPlainDateTime(
            courseInstance.publishing_end_date,
            courseInstance.display_timezone,
          ).toString()
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
      end_date: DateToPlainDateTime(extension.end_date, courseInstance.display_timezone).toString(),
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
    setModalDefaults({ name: '', end_date: '', uids: '' });
  };

  const openDeleteModal = (extension: CourseInstancePublishingExtensionWithUsers) => {
    setDeleteState({
      show: true,
      extensionId: extension.id,
      extensionName: extension.name,
      userData: extension.user_data,
    });
  };

  const closeDeleteModal = () => setDeleteState({ show: false });

  const deleteMutation = useMutation({
    mutationFn: async (extensionId: string) => {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'delete_extension',
        extension_id: extensionId,
      };
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error('Failed to delete extension');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extensions'] });
      closeDeleteModal();
    },
    onError: (error) => {
      console.error('Error deleting extension:', error);
      setErrorMessage('Failed to delete extension. Please try again.');
      closeDeleteModal();
    },
  });

  const confirmDelete = () => {
    if (!deleteState.show) return;
    void deleteMutation.mutate(deleteState.extensionId);
  };

  return (
    <>
      <div class="mb-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h5 class="mb-0">Extensions</h5>
          {canEdit && hasSaved && (
            <button
              type="button"
              class="btn btn-outline-primary btn-sm text-nowrap"
              disabled={deleteMutation.isPending}
              onClick={openAddModal}
            >
              Add Extension
            </button>
          )}
        </div>
        <small class="text-muted">
          Extend access to specific users beyond the original end date. If multiple extensions apply
          to a user, the latest extension date will take effect. If an extension is before the end
          date, it will be ignored.
        </small>
      </div>

      {extensions.length === 0 && (
        <div class="text-center text-muted mb-3">
          <p class="mb-0">
            {hasSaved
              ? 'No extensions configured.'
              : 'Extensions are not available until the course instance publishing settings are saved.'}
          </p>
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
                <th class="col-1">End date</th>
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
                  isSubmitting={deleteMutation.isPending}
                  courseInstanceEndDate={courseInstance.publishing_end_date}
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
          currentUnpublishText={currentInstanceEndDate}
          mode={shownModalMode}
          mainEndDate={courseInstance.publishing_end_date}
          courseInstanceTimezone={courseInstance.display_timezone}
          csrfToken={csrfToken}
          editExtensionId={editExtensionId}
          onHide={closeModal}
          onSaveSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['extensions'] });
          }}
        />
      )}

      {deleteState.show && (
        <Modal backdrop="static" show onHide={closeDeleteModal}>
          <Modal.Header closeButton>
            <Modal.Title>Delete Extension</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {deleteState.userData.length > 0 ? (
              <>
                Are you sure you want to delete{' '}
                {deleteState.extensionName === null
                  ? 'this extension'
                  : `the extension "${deleteState.extensionName}"`}{' '}
                with students: "{deleteState.userData.map((user) => user.uid).join(', ')}"?
              </>
            ) : (
              <>
                Are you sure you want to delete{' '}
                {deleteState.extensionName === null
                  ? 'this extension'
                  : `the extension "${deleteState.extensionName}"`}
                ?
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <button
              type="button"
              class="btn btn-outline-secondary"
              disabled={deleteMutation.isPending}
              onClick={closeDeleteModal}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-danger"
              disabled={deleteMutation.isPending}
              onClick={confirmDelete}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
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
  courseInstanceEndDate,
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
  courseInstanceEndDate: Date | null;
  showAllStudents: Set<string>;
  onToggleShowAllStudents: (extensionId: string) => void;
  onEditExtension: (extension: CourseInstancePublishingExtensionWithUsers) => void;
}) {
  // Check if extension end date is before the course instance end date
  const isBeforeInstanceEndDate =
    courseInstanceEndDate && extension.end_date < courseInstanceEndDate;

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
        {isBeforeInstanceEndDate ? (
          <span
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            title="This date is before the course instance end date and will be ignored"
          >
            {formatDateFriendly(extension.end_date, timeZone)}
            <i class="fas fa-exclamation-triangle text-warning" aria-hidden="true" />
          </span>
        ) : (
          <span>{formatDateFriendly(extension.end_date, timeZone)}</span>
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
