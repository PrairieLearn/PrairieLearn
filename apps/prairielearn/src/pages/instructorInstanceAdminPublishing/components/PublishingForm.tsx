import assert from 'assert';

import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'preact/compat';
import { Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../instructorInstanceAdminPublishing.types.js';
import {
  DateToPlainDateTime,
  nowDateInTimezone,
  plainDateTimeStringToDate,
} from '../utils/dateUtils.js';

import { PublishingExtensions } from './PublishingExtensions.js';

const queryClient = new QueryClient();

type PublishingStatus = 'unpublished' | 'publish_scheduled' | 'published';

/** Helper to compute the current status of a course instance. */
function computeCourseInstanceStatus(courseInstance: StaffCourseInstance): PublishingStatus {
  if (!courseInstance.publishing_start_date && !courseInstance.publishing_end_date) {
    return 'unpublished';
  }
  assert(
    courseInstance.publishing_start_date !== null && courseInstance.publishing_end_date !== null,
  );

  const now = nowDateInTimezone(courseInstance.display_timezone);

  if (courseInstance.publishing_end_date <= now) {
    return 'unpublished';
  }
  if (courseInstance.publishing_start_date > now) {
    return 'publish_scheduled';
  }
  return 'published';
}

interface PublishingFormValues {
  startDate: string;
  endDate: string;
}

export function PublishingForm({
  courseInstance,
  hasAccessRules,
  canEdit,
  csrfToken,
  origHash,
  publishingExtensions,
  isDevMode,
}: {
  courseInstance: StaffCourseInstance;
  hasAccessRules: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  publishingExtensions: CourseInstancePublishingExtensionWithUsers[];
  isDevMode: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const originalStartDate = courseInstance.publishing_start_date;
  const originalEndDate = courseInstance.publishing_end_date;

  const originalStatus = computeCourseInstanceStatus(courseInstance);

  const [selectedStatus, setSelectedStatus] = useState<PublishingStatus>(originalStatus);

  const defaultValues: PublishingFormValues = {
    startDate: originalStartDate
      ? DateToPlainDateTime(originalStartDate, courseInstance.display_timezone).toString()
      : '',
    endDate: originalEndDate
      ? DateToPlainDateTime(originalEndDate, courseInstance.display_timezone).toString()
      : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<PublishingFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  // Add browser prompt when navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Chrome requires returnValue to be set
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  let now = nowDateInTimezone(courseInstance.display_timezone);

  // Update form values when status changes
  const handleStatusChange = (newStatus: PublishingStatus) => {
    setSelectedStatus(newStatus);

    // "Now" must be rounded to the nearest second, as that's what `datetime-local` supports.
    now = nowDateInTimezone(courseInstance.display_timezone);
    const nowTemporal = DateToPlainDateTime(now, courseInstance.display_timezone);

    const oneWeekLater = nowTemporal.add({ weeks: 1 });
    const eighteenWeeksLater = nowTemporal.add({ weeks: 18 });

    const currentStartDate = startDate === '' ? null : Temporal.PlainDateTime.from(startDate);
    const currentEndDate = endDate === '' ? null : Temporal.PlainDateTime.from(endDate);

    // Compute updated dates. We will update them at the end of this function.
    let updatedStartDate = currentStartDate;
    let updatedEndDate = currentEndDate;

    switch (newStatus) {
      case 'unpublished': {
        // If the original dates from the form put the course instance in a unpublished state,
        // use those dates.
        if (originalStartDate && originalEndDate && now >= originalEndDate) {
          updatedStartDate = DateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
          updatedEndDate = DateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
          break;
        }

        // If the original start date was in the past, use that.
        // Otherwise, we are transitioning from 'scheduled publish' to 'unpublished'. Drop both dates.
        if (originalStartDate && originalStartDate < now) {
          updatedStartDate = DateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
          updatedEndDate = nowTemporal;
        } else {
          updatedStartDate = null;
          updatedEndDate = null;
        }
        break;
      }
      case 'publish_scheduled': {
        // If the original dates from the form put the course instance in a publish scheduled state,
        // use those dates.
        if (originalStartDate && originalEndDate && now <= originalStartDate) {
          updatedStartDate = DateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
          updatedEndDate = DateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
          break;
        }

        if (originalStartDate && now <= originalStartDate) {
          // Try to re-use the original start date if it is in the future.
          updatedStartDate = DateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentStartDate === null ||
          Temporal.PlainDateTime.compare(currentStartDate, nowTemporal) <= 0
        ) {
          updatedStartDate = oneWeekLater;
        }

        if (originalEndDate && now <= originalEndDate) {
          // Try to re-use the original end date if it is in the future.
          updatedEndDate = DateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
        } else if (
          currentEndDate === null ||
          Temporal.PlainDateTime.compare(currentEndDate, nowTemporal) <= 0 ||
          Temporal.PlainDateTime.compare(updatedStartDate!, currentEndDate) >= 0
        ) {
          updatedEndDate = eighteenWeeksLater;
        }
        break;
      }
      case 'published': {
        if (originalStartDate && now >= originalStartDate) {
          // Try to re-use the original start date if it is in the past.
          updatedStartDate = DateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentStartDate === null ||
          // If the current start date is in the future, set it to now.
          Temporal.PlainDateTime.compare(currentStartDate, nowTemporal) > 0
        ) {
          updatedStartDate = nowTemporal;
        }

        if (originalEndDate && now <= originalEndDate) {
          // Try to re-use the original end date if it is in the future.
          updatedEndDate = DateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
        } else if (
          currentEndDate === null ||
          // If the current end date is in the past, set it to 18 weeks from now.
          Temporal.PlainDateTime.compare(currentEndDate, nowTemporal) < 0
        ) {
          updatedEndDate = eighteenWeeksLater;
        }
        break;
      }
    }
    setValue('startDate', updatedStartDate === null ? '' : updatedStartDate.toString());
    setValue('endDate', updatedEndDate === null ? '' : updatedEndDate.toString());
  };

  const onSubmit = async (data: PublishingFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        accessControl: {
          startDate: data.startDate === '' ? null : data.startDate,
          endDate: data.endDate === '' ? null : data.endDate,
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
        return;
      }

      const errorData = await response.json();
      if (errorData.message) {
        setErrorMessage(errorData.message);
      }
    } catch (error) {
      console.error('Error updating access control:', error);
      setErrorMessage('Failed to update access control. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddWeek = async (field: 'startDate' | 'endDate') => {
    const currentValue = field === 'startDate' ? startDate : endDate;
    if (currentValue) {
      const currentDate = Temporal.PlainDateTime.from(currentValue);
      const newValue = currentDate.add({ weeks: 1 });
      setValue(field, newValue.toString());
      // setValue doesn't seem to trigger validation so we need to trigger it manually
      await trigger('startDate');
      await trigger('endDate');
    }
  };

  // Validation
  const validateStartDate = (value: string) => {
    if (selectedStatus === 'publish_scheduled') {
      if (!value) {
        return 'Start date is required for scheduled publishing';
      }
      // Check if start date is in the future
      const startDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
      if (startDateTime <= nowDateInTimezone(courseInstance.display_timezone)) {
        return 'Start date must be in the future for scheduled publishing';
      }
    }
    return true;
  };

  const validateEndDate = (value: string) => {
    if (selectedStatus !== 'unpublished') {
      if (!value) {
        return 'End date is required';
      }
      // Check if end date is after start date
      if (startDate && value) {
        const startDateTime = plainDateTimeStringToDate(startDate, courseInstance.display_timezone);
        const endDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
        if (endDateTime <= startDateTime) {
          return 'End date must be after start date';
        }
      }
    }
    return true;
  };

  if (hasAccessRules) {
    return (
      <div class="alert alert-warning" role="alert">
        <strong>Legacy Access Rules Active:</strong> This course instance is using the legacy
        allowAccess system. To use the new access control system, you must first remove all
        allowAccess rules from the course configuration.
      </div>
    );
  }

  return (
    <>
      {errorMessage && (
        <Alert variant="danger" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
      <div class="mb-4">
        <h4 class="mb-4">Publishing</h4>

        {!canEdit && (
          <div class="alert alert-info" role="alert">
            You do not have permission to edit access control settings.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" name="__csrf_token" value={csrfToken} />

          {/* Status Radio Buttons */}
          <div class="mb-4">
            {/* Unpublished */}
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  name="status"
                  id="status-unpublished"
                  value="unpublished"
                  checked={selectedStatus === 'unpublished'}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                      handleStatusChange('unpublished');
                    }
                  }}
                />
                <label class="form-check-label" for="status-unpublished">
                  Unpublished
                </label>
              </div>
              {selectedStatus === 'unpublished' && (
                <div class="ms-4 mt-1 small text-muted">
                  Course is not accessible by any students
                  {startDate && ' except those with extensions'}.
                  {endDate && (
                    <>
                      <br />
                      The course{' '}
                      {plainDateTimeStringToDate(endDate, courseInstance.display_timezone) < now
                        ? 'was'
                        : 'will be'}{' '}
                      unpublished at{' '}
                      <FriendlyDate
                        date={plainDateTimeStringToDate(endDate, courseInstance.display_timezone)}
                        timezone={courseInstance.display_timezone}
                        tooltip={true}
                        options={{ timeFirst: true }}
                      />
                      .
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Publish Scheduled */}
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  name="status"
                  id="status-publish-scheduled"
                  value="publish_scheduled"
                  checked={selectedStatus === 'publish_scheduled'}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                      handleStatusChange('publish_scheduled');
                    }
                  }}
                />
                <label class="form-check-label" for="status-publish-scheduled">
                  Scheduled to be published
                  {/* Published at a scheduled future date */}
                </label>
              </div>
              {selectedStatus === 'publish_scheduled' && startDate && endDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course will be published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(startDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(endDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />
                  .
                </div>
              )}
              {selectedStatus === 'publish_scheduled' && (
                <div class="ms-4 mt-2">
                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                      <label class="form-label mb-0" for="startDate">
                        Start date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!startDate}
                          onClick={() => handleAddWeek('startDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.startDate && 'is-invalid')}
                        id="startDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('startDate', {
                          validate: validateStartDate,
                          deps: ['endDate'],
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.startDate && (
                      <div class="text-danger small mt-1">{errors.startDate.message}</div>
                    )}
                  </div>

                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                      <label class="form-label mb-0" for="endDate">
                        End date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!endDate}
                          onClick={() => handleAddWeek('endDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.endDate && 'is-invalid')}
                        id="endDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('endDate', {
                          validate: validateEndDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.endDate && (
                      <div class="text-danger small mt-1">{errors.endDate.message}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Published */}
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  name="status"
                  id="status-published"
                  value="published"
                  checked={selectedStatus === 'published'}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                      handleStatusChange('published');
                    }
                  }}
                />
                <label class="form-check-label" for="status-published">
                  Published
                </label>
              </div>
              {selectedStatus === 'published' && startDate && endDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course{' '}
                  {plainDateTimeStringToDate(startDate, courseInstance.display_timezone) < now
                    ? 'was'
                    : 'will be'}{' '}
                  published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(startDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(endDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />
                  .
                </div>
              )}
              {selectedStatus === 'published' && (
                <div class="ms-4 mt-2">
                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                      <label class="form-label mb-0" for="endDate">
                        End date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!endDate}
                          onClick={() => handleAddWeek('endDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.endDate && 'is-invalid')}
                        id="endDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('endDate', {
                          validate: validateEndDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.endDate && (
                      <div class="text-danger small mt-1">{errors.endDate.message}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Save and Cancel Buttons */}
          {canEdit && (
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </form>

        {startDate && (
          <>
            <hr class="my-4" />
            <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
              <PublishingExtensions
                courseInstance={courseInstance}
                initialExtensions={publishingExtensions}
                canEdit={canEdit}
                csrfToken={csrfToken}
              />
            </QueryClientProviderDebug>
          </>
        )}
      </div>
    </>
  );
}

PublishingForm.displayName = 'PublishingForm';
