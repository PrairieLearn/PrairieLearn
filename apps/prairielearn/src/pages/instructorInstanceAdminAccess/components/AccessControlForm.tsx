import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type {
  CourseInstance,
  CourseInstanceAccessControlExtension,
} from '../../../lib/db-types.js';

import { AccessControlOverrides } from './AccessControlOverrides.js';

// Create QueryClient outside component to ensure stability
const queryClient = new QueryClient();

// Helper function to format dates from the database
const formatDatabaseDate = (date: Date | null): string => {
  if (!date) return '';
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
};

// Reusable StatusHeader component
interface StatusHeaderProps {
  status: 'published' | 'unpublished' | 'archived';
  statusText: string;
  actionButton?: preact.JSX.Element;
}

const StatusHeader = ({ status, statusText, actionButton }: StatusHeaderProps) => {
  const statusClasses = {
    published: 'text-success',
    unpublished: 'text-warning',
    archived: 'text-danger',
  };

  const statusLabels = {
    published: 'Published',
    unpublished: 'Unpublished',
    archived: 'Archived',
  };

  return (
    <div class="mb-3 d-flex justify-content-between align-items-start">
      <div>
        <h5 class="mb-2">
          Status: <span class={statusClasses[status]}>{statusLabels[status]}</span>
        </h5>
        <p class="text-muted mb-0">{statusText}</p>
      </div>
      {actionButton}
    </div>
  );
};

// Reusable DateField component
interface DateFieldProps {
  id: string;
  label: string;
  register: any;
  errors: any;
  canEdit: boolean;
  required?: boolean;
  validation?: any;
}

const DateField = ({
  id,
  label,
  register,
  errors,
  canEdit,
  required = false,
  validation,
}: DateFieldProps) => {
  return (
    <div class="mb-3">
      <label class="form-label" for={id}>
        <strong>{label}</strong>
      </label>
      <input
        type="datetime-local"
        class={clsx('form-control', errors[id] && 'is-invalid')}
        id={id}
        disabled={!canEdit}
        {...register(id, {
          required: required ? `${label} is required` : false,
          ...validation,
        })}
      />
      {errors[id] && <div class="invalid-feedback">{errors[id].message}</div>}
    </div>
  );
};

// Reusable ActionButton component
interface ActionButtonProps {
  type: 'button' | 'submit';
  variant: 'primary' | 'outline-danger' | 'success';
  disabled: boolean;
  onClick?: () => void;
  title?: string;
  children: preact.JSX.Element | string;
}

const ActionButton = ({ type, variant, disabled, onClick, title, children }: ActionButtonProps) => {
  const buttonClasses = {
    primary: 'btn btn-primary',
    'outline-danger': 'btn btn-outline-danger',
    success: 'btn btn-success',
  };

  return (
    <button
      // eslint-disable-next-line @eslint-react/dom/no-missing-button-type
      type={type}
      class={buttonClasses[variant]}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface AccessControlFormValues {
  publishedStartDate: string;
  publishedEndDate: string;
}

interface AccessControlFormProps {
  courseInstance: CourseInstance;
  hasAccessRules: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  accessControlExtensions: CourseInstanceAccessControlExtension[];
}

export function AccessControlForm({
  courseInstance,
  hasAccessRules,
  canEdit,
  csrfToken,
  origHash,
  accessControlExtensions,
}: AccessControlFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [newArchiveDate, setNewArchiveDate] = useState('');
  const [startDateType, setStartDateType] = useState<'now' | 'scheduled'>('now');

  const defaultValues: AccessControlFormValues = {
    publishedStartDate: courseInstance.access_control_published_start_date
      ? Temporal.Instant.fromEpochMilliseconds(
          courseInstance.access_control_published_start_date.getTime(),
        )
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
      : '',
    publishedEndDate: courseInstance.access_control_published_end_date
      ? Temporal.Instant.fromEpochMilliseconds(
          courseInstance.access_control_published_end_date.getTime(),
        )
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
      : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AccessControlFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const publishedStartDate = watch('publishedStartDate');
  const publishedEndDate = watch('publishedEndDate');

  // Initialize start date type based on existing data
  useEffect(() => {
    if (publishedStartDate && publishedStartDate.trim() !== '') {
      setStartDateType('scheduled');
    } else {
      setStartDateType('now');
    }
  }, [publishedStartDate]);

  // Determine current state based on dates
  const getAccessControlState = (): 'published' | 'archived' | 'unpublished' => {
    const hasStartDate = courseInstance.access_control_published_start_date !== null;
    const hasEndDate = courseInstance.access_control_published_end_date !== null;

    // TODO: 'now' should put it in the timezone of the course instance.
    // the dates should be displayed with information about the timezone they are in.
    if (hasStartDate && hasEndDate) {
      const now = new Date();
      const startDate = courseInstance.access_control_published_start_date!;
      const endDate = courseInstance.access_control_published_end_date!;

      // Check if archived
      if (endDate <= now) {
        return 'archived';
      }

      // Check if start date is in the future
      if (startDate > now) {
        return 'unpublished';
      }

      return 'published';
    }

    return 'unpublished';
  };

  const accessControlState = getAccessControlState();

  const onSubmit = async (data: AccessControlFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      // Handle start date based on radio selection
      let startDate: string | null = null;
      if (startDateType === 'now') {
        const now = new Date();
        startDate = now.toISOString().slice(0, 16);
      } else if (data.publishedStartDate) {
        startDate = data.publishedStartDate;
      }

      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        accessControl: {
          publishedStartDate: startDate ? Temporal.PlainDateTime.from(startDate).toString() : null,
          publishedEndDate: data.publishedEndDate
            ? Temporal.PlainDateTime.from(data.publishedEndDate).toString()
            : null,
        },
        orig_hash: origHash,
      };

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        throw new Error('Failed to update access control');
      }
    } catch (error) {
      console.error('Error updating access control:', error);
      // eslint-disable-next-line no-alert
      alert('Failed to update access control. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnpublish = () => {
    setShowUnpublishModal(true);
  };

  const handleUnpublishConfirm = async () => {
    setValue('publishedStartDate', '');
    setValue('publishedEndDate', '');
    setShowUnpublishModal(false);

    // Submit the form with empty dates to unpublish
    const formData = {
      publishedStartDate: '',
      publishedEndDate: '',
    };

    await onSubmit(formData);
  };

  const handleExtend = () => {
    setShowExtendModal(true);
  };

  const handleExtendSubmit = () => {
    if (newArchiveDate) {
      setValue('publishedEndDate', newArchiveDate);
      void handleSubmit(onSubmit)();
    }
    setShowExtendModal(false);
  };

  const handleQuickExtend = (days: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const isoString = newDate.toISOString().slice(0, 16);
    setValue('publishedEndDate', isoString);
    void handleSubmit(onSubmit)();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (hasAccessRules) {
    return (
      <div class="alert alert-info" role="alert">
        <strong>Legacy Access Rules Active:</strong> This course instance is using the legacy
        allowAccess system. To use the new access control system, you must first remove all
        allowAccess rules from the course configuration.
      </div>
    );
  }

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Access Control Settings</h1>
        </div>
        <div class="card-body">
          <form onSubmit={handleSubmit(onSubmit)}>
            <input type="hidden" name="__csrf_token" value={csrfToken} />

            {/* Published State */}
            {accessControlState === 'published' && (
              <div class="mb-4">
                <StatusHeader
                  status="published"
                  statusText={`Course was accessible starting on ${formatDate(formatDatabaseDate(courseInstance.access_control_published_start_date))} and will no longer be accessible after ${formatDate(formatDatabaseDate(courseInstance.access_control_published_end_date))}.`}
                  actionButton={
                    canEdit ? (
                      <ActionButton
                        type="button"
                        variant="outline-danger"
                        disabled={isSubmitting}
                        title="This will immediately unpublish the course, making it inaccessible to all students."
                        onClick={handleUnpublish}
                      >
                        Unpublish Course
                      </ActionButton>
                    ) : undefined
                  }
                />

                <hr class="my-4" />

                <DateField
                  id="publishedStartDate"
                  label="Start Date"
                  register={register}
                  errors={errors}
                  canEdit={canEdit}
                  validation={{
                    validate: (value: string) => {
                      if (!value && publishedEndDate) {
                        return 'Start date is required when archive date is set';
                      }
                      return true;
                    },
                  }}
                />

                <DateField
                  id="publishedEndDate"
                  label="Archive Date"
                  register={register}
                  errors={errors}
                  canEdit={canEdit}
                  required={true}
                />

                {canEdit && (
                  <div class="d-flex gap-2">
                    <ActionButton type="submit" variant="primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </ActionButton>
                  </div>
                )}
              </div>
            )}

            {/* Unpublished State */}
            {accessControlState === 'unpublished' && (
              <div class="mb-4">
                <StatusHeader
                  status="unpublished"
                  statusText={`Course is currently not accessible.${publishedStartDate && publishedEndDate ? ` Course will be accessible starting on ${formatDate(publishedStartDate)} and will no longer be accessible after ${formatDate(publishedEndDate)}.` : ''}`}
                />

                <div class="mb-3">
                  <div class="form-label">
                    <strong>Start Date</strong>
                  </div>
                  <div class="mb-3">
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="startDateType"
                        id="startDateNow"
                        value="now"
                        checked={startDateType === 'now'}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const target = e.target as HTMLInputElement;
                          setStartDateType(target.value as 'now' | 'scheduled');
                        }}
                      />
                      <label class="form-check-label" for="startDateNow">
                        Now
                      </label>
                    </div>
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="startDateType"
                        id="startDateScheduled"
                        value="scheduled"
                        checked={startDateType === 'scheduled'}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const target = e.target as HTMLInputElement;
                          setStartDateType(target.value as 'now' | 'scheduled');
                        }}
                      />
                      <label class="form-check-label" for="startDateScheduled">
                        Scheduled
                      </label>
                    </div>
                  </div>

                  {startDateType === 'scheduled' && (
                    <DateField
                      id="publishedStartDate"
                      label="Scheduled Start Date"
                      register={register}
                      errors={errors}
                      canEdit={canEdit}
                      required={startDateType === 'scheduled'}
                      validation={{
                        validate: (value: string, { publishedEndDate }) => {
                          if (!value && publishedEndDate) {
                            return 'Start date is required when archive date is set';
                          }
                          return true;
                        },
                      }}
                    />
                  )}
                </div>

                <DateField
                  id="publishedEndDate"
                  label="Archive Date"
                  register={register}
                  validation={{
                    deps: ['publishedStartDate'],
                  }}
                  errors={errors}
                  canEdit={canEdit}
                  required={true}
                />

                {canEdit && (
                  <div class="d-flex gap-2">
                    <ActionButton type="submit" variant="primary" disabled={isSubmitting}>
                      {isSubmitting
                        ? 'Saving...'
                        : startDateType === 'now'
                          ? 'Publish Now'
                          : 'Schedule Publish'}
                    </ActionButton>
                  </div>
                )}
              </div>
            )}

            {/* Archived State */}
            {accessControlState === 'archived' && (
              <div class="mb-4">
                <StatusHeader
                  status="archived"
                  statusText={`Course was accessible from ${formatDate(formatDatabaseDate(courseInstance.access_control_published_start_date))} to ${formatDate(formatDatabaseDate(courseInstance.access_control_published_end_date))} but is no longer accessible.`}
                  actionButton={
                    canEdit ? (
                      <ActionButton
                        type="button"
                        variant="success"
                        disabled={isSubmitting}
                        title="This will open a modal with options to extend the archive date and pick a new date."
                        onClick={handleExtend}
                      >
                        Extend Access
                      </ActionButton>
                    ) : undefined
                  }
                />

                <DateField
                  id="publishedStartDate"
                  label="Start Date"
                  register={register}
                  errors={errors}
                  canEdit={canEdit}
                  validation={{
                    validate: (value: string) => {
                      if (!value && publishedEndDate) {
                        return 'Start date is required when archive date is set';
                      }
                      return true;
                    },
                  }}
                />

                <DateField
                  id="publishedEndDate"
                  label="Archive Date"
                  register={register}
                  errors={errors}
                  canEdit={canEdit}
                />

                {canEdit && (
                  <div class="d-flex gap-2">
                    <ActionButton type="submit" variant="primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </ActionButton>
                  </div>
                )}
              </div>
            )}

            {!canEdit && (
              <div class="alert alert-info" role="alert">
                You do not have permission to edit access control settings.
              </div>
            )}
          </form>

          {/* Access Control Extensions Section - Only show when not unpublished */}
          {accessControlState !== 'unpublished' && (
            <>
              <hr class="my-4" />
              <QueryClientProviderDebug client={queryClient} isDevMode={false}>
                <AccessControlOverrides
                  courseInstance={courseInstance}
                  overrides={accessControlExtensions}
                  canEdit={canEdit}
                  csrfToken={csrfToken}
                />
              </QueryClientProviderDebug>
            </>
          )}
        </div>
      </div>

      {/* Unpublish Confirmation Modal */}
      {showUnpublishModal && (
        <div class="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Confirm Unpublish Course</h5>
                <button
                  type="button"
                  class="btn-close"
                  onClick={() => setShowUnpublishModal(false)}
                />
              </div>
              <div class="modal-body">
                <p class="text-muted mb-3">
                  This will immediately hide the course from all enrolled students. The course will
                  no longer be accessible to anyone.
                </p>
                <p class="text-muted mb-0">
                  You can republish the course at any point by setting new start and archive dates.
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => setShowUnpublishModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  disabled={isSubmitting}
                  onClick={handleUnpublishConfirm}
                >
                  {isSubmitting ? 'Unpublishing...' : 'Unpublish Course'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {showExtendModal && (
        <div class="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Extend Course Access</h5>
                <button type="button" class="btn-close" onClick={() => setShowExtendModal(false)} />
              </div>
              <div class="modal-body">
                <p class="text-muted mb-3">
                  This will open a modal with options to extend the archive date and pick a new
                  date.
                </p>
                <div class="mb-3">
                  <label class="form-label" for="currentArchiveDate">
                    <strong>Current Archive Date</strong>
                  </label>
                  <input
                    type="datetime-local"
                    class="form-control"
                    id="currentArchiveDate"
                    value={publishedEndDate}
                    style={{ backgroundColor: '#f8f9fa' }}
                    disabled
                  />
                </div>
                <div class="mb-3">
                  <label class="form-label" for="customArchiveDate">
                    <strong>New Archive Date</strong>
                  </label>
                  <input
                    type="datetime-local"
                    class="form-control"
                    id="customArchiveDate"
                    value={newArchiveDate}
                    onChange={(e) => setNewArchiveDate((e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="mb-3">
                  <div class="form-label">Quick Options</div>
                  <div class="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(7)}
                    >
                      + 1 week
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(30)}
                    >
                      + 1 month
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(90)}
                    >
                      + 3 months
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      onClick={() => handleQuickExtend(365)}
                    >
                      + 1 year
                    </button>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => setShowExtendModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-success"
                  disabled={!newArchiveDate}
                  onClick={handleExtendSubmit}
                >
                  Extend Access
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

AccessControlForm.displayName = 'AccessControlForm';
