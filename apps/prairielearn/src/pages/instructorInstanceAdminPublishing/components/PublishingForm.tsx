import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-publishing-extensions.types.js';
import {
  DateToPlainDateTime,
  nowDateInTimezone,
  plainDateTimeStringToDate,
} from '../utils/dateUtils.js';

import { PublishingExtensions } from './PublishingExtensions.js';

// Create QueryClient outside component to ensure stability
const queryClient = new QueryClient();

type PublishingStatus = 'unpublished' | 'publish_scheduled' | 'published';

/** Helper to compute status from dates and current time. */
function computeStatus(
  publishDate: Date | null,
  unpublishDate: Date | null,
  courseInstance: StaffCourseInstance,
): PublishingStatus {
  if (!publishDate && !unpublishDate) {
    return 'unpublished';
  }

  const now = nowDateInTimezone(courseInstance.display_timezone);

  if (publishDate && unpublishDate) {
    if (unpublishDate <= now) {
      return 'unpublished';
    }
    if (publishDate > now) {
      return 'publish_scheduled';
    }
    return 'published';
  }

  // Should not happen in valid states, but default to unpublished
  return 'unpublished';
}

interface PublishingFormValues {
  publishDate: string;
  unpublishDate: string;
}

export function PublishingForm({
  courseInstance,
  hasAccessRules,
  canEdit,
  csrfToken,
  origHash,
  accessControlExtensions,
}: {
  courseInstance: StaffCourseInstance;
  hasAccessRules: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  accessControlExtensions: CourseInstancePublishingExtensionWithUsers[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const originalPublishDate = courseInstance.publishing_publish_date;
  const originalUnpublishDate = courseInstance.publishing_unpublish_date;

  const originalStatus = computeStatus(
    courseInstance.publishing_publish_date,
    courseInstance.publishing_unpublish_date,
    courseInstance,
  );

  const [selectedStatus, setSelectedStatus] = useState<PublishingStatus>(originalStatus);

  const defaultValues: PublishingFormValues = {
    publishDate: originalPublishDate
      ? DateToPlainDateTime(originalPublishDate, courseInstance.display_timezone).toString()
      : '',
    unpublishDate: originalUnpublishDate
      ? DateToPlainDateTime(originalUnpublishDate, courseInstance.display_timezone).toString()
      : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<PublishingFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const publishDate = watch('publishDate');
  const unpublishDate = watch('unpublishDate');

  let now = nowDateInTimezone(courseInstance.display_timezone);

  // Update form values when status changes
  const handleStatusChange = (newStatus: PublishingStatus) => {
    setSelectedStatus(newStatus);

    // "Now" must be rounded to the nearest second, as that's what `datetime-local` supports.
    now = nowDateInTimezone(courseInstance.display_timezone);
    const nowTemporal = DateToPlainDateTime(now, courseInstance.display_timezone);

    const oneWeekLater = nowTemporal.add({ weeks: 1 });
    const eighteenWeeksLater = nowTemporal.add({ weeks: 18 });

    const currentPublishDate = publishDate === '' ? null : Temporal.PlainDateTime.from(publishDate);
    const currentUnpublishDate =
      unpublishDate === '' ? null : Temporal.PlainDateTime.from(unpublishDate);

    // Compute updated dates. We will update them at the end of this function.
    let updatedPublishDate = currentPublishDate;
    let updatedUnpublishDate = currentUnpublishDate;

    switch (newStatus) {
      case 'unpublished': {
        // If the original dates from the form put the course instance in a unpublished state,
        // use those dates.
        if (originalPublishDate && originalUnpublishDate && now >= originalUnpublishDate) {
          updatedPublishDate = DateToPlainDateTime(
            originalPublishDate,
            courseInstance.display_timezone,
          );
          updatedUnpublishDate = DateToPlainDateTime(
            originalUnpublishDate,
            courseInstance.display_timezone,
          );
          break;
        }

        // If the original publish date was in the past, use that.
        // Otherwise, we are transitioning from 'scheduled publish' to 'unpublished'. Drop both dates.
        if (originalPublishDate && originalPublishDate < now) {
          updatedPublishDate = DateToPlainDateTime(
            originalPublishDate,
            courseInstance.display_timezone,
          );
          updatedUnpublishDate = nowTemporal;
        } else {
          updatedPublishDate = null;
          updatedUnpublishDate = null;
        }
        break;
      }
      case 'publish_scheduled': {
        // If the original dates from the form put the course instance in a publish scheduled state,
        // use those dates.
        if (originalPublishDate && originalUnpublishDate && now <= originalPublishDate) {
          updatedPublishDate = DateToPlainDateTime(
            originalPublishDate,
            courseInstance.display_timezone,
          );
          updatedUnpublishDate = DateToPlainDateTime(
            originalUnpublishDate,
            courseInstance.display_timezone,
          );
          break;
        }

        if (originalPublishDate && now <= originalPublishDate) {
          // Try to re-use the original publish date if it is in the future.
          updatedPublishDate = DateToPlainDateTime(
            originalPublishDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentPublishDate === null ||
          Temporal.PlainDateTime.compare(currentPublishDate, nowTemporal) <= 0
        ) {
          updatedPublishDate = oneWeekLater;
        }

        if (originalUnpublishDate && now <= originalUnpublishDate) {
          // Try to re-use the original unpublish date if it is in the future.
          updatedUnpublishDate = DateToPlainDateTime(
            originalUnpublishDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentUnpublishDate === null ||
          Temporal.PlainDateTime.compare(currentUnpublishDate, nowTemporal) <= 0 ||
          Temporal.PlainDateTime.compare(updatedPublishDate!, currentUnpublishDate) >= 0
        ) {
          updatedUnpublishDate = eighteenWeeksLater;
        }
        break;
      }
      case 'published': {
        if (originalPublishDate && now >= originalPublishDate) {
          // Try to re-use the original publish date if it is in the past.
          updatedPublishDate = DateToPlainDateTime(
            originalPublishDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentPublishDate === null ||
          // If the current publish date is in the future, set it to now.
          Temporal.PlainDateTime.compare(currentPublishDate, nowTemporal) > 0
        ) {
          updatedPublishDate = nowTemporal;
        }

        if (originalUnpublishDate && now <= originalUnpublishDate) {
          // Try to re-use the original unpublish date if it is in the future.
          updatedUnpublishDate = DateToPlainDateTime(
            originalUnpublishDate,
            courseInstance.display_timezone,
          );
        } else if (
          currentUnpublishDate === null ||
          // If the current unpublish date is in the past, set it to 18 weeks from now.
          Temporal.PlainDateTime.compare(currentUnpublishDate, nowTemporal) < 0
        ) {
          updatedUnpublishDate = eighteenWeeksLater;
        }
        break;
      }
    }
    setValue('publishDate', updatedPublishDate === null ? '' : updatedPublishDate.toString());
    setValue('unpublishDate', updatedUnpublishDate === null ? '' : updatedUnpublishDate.toString());
  };

  const onSubmit = async (data: PublishingFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        accessControl: {
          publishDate: data.publishDate === '' ? null : data.publishDate,
          unpublishDate: data.unpublishDate === '' ? null : data.unpublishDate,
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

  const handleAddWeek = async (field: 'publishDate' | 'unpublishDate') => {
    const currentValue = field === 'publishDate' ? publishDate : unpublishDate;
    if (currentValue) {
      const currentDate = Temporal.PlainDateTime.from(currentValue);
      const newValue = currentDate.add({ weeks: 1 });
      setValue(field, newValue.toString());
      // setValue doesn't seem to trigger validation so we need to trigger it manually
      await trigger('publishDate');
      await trigger('unpublishDate');
    }
  };

  // Validation
  const validatePublishDate = (value: string) => {
    if (selectedStatus === 'publish_scheduled') {
      if (!value) {
        return 'Publish date is required for scheduled publishing';
      }
      // Check if publish date is in the future
      const publishDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
      if (publishDateTime <= nowDateInTimezone(courseInstance.display_timezone)) {
        return 'Publish date must be in the future for scheduled publishing';
      }
    }
    return true;
  };

  const validateUnpublishDate = (value: string) => {
    if (selectedStatus !== 'unpublished') {
      if (!value) {
        return 'Unpublish date is required';
      }
      // Check if unpublish date is after publish date
      if (publishDate && value) {
        const publishDateTime = plainDateTimeStringToDate(
          publishDate,
          courseInstance.display_timezone,
        );
        const unpublishDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
        if (unpublishDateTime <= publishDateTime) {
          return 'Unpublish date must be after publish date';
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
                  {publishDate && ' except those with extensions'}.
                  {unpublishDate && (
                    <>
                      <br />
                      The course{' '}
                      {plainDateTimeStringToDate(unpublishDate, courseInstance.display_timezone) <
                      now
                        ? 'was'
                        : 'will be'}{' '}
                      unpublished at{' '}
                      <FriendlyDate
                        date={plainDateTimeStringToDate(
                          unpublishDate,
                          courseInstance.display_timezone,
                        )}
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
              {selectedStatus === 'publish_scheduled' && publishDate && unpublishDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course will be published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(publishDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(unpublishDate)}
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
                      <label class="form-label mb-0" for="publishDate">
                        Publish Date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!publishDate}
                          onClick={() => handleAddWeek('publishDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.publishDate && 'is-invalid')}
                        id="publishDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('publishDate', {
                          validate: validatePublishDate,
                          deps: ['unpublishDate'],
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.publishDate && (
                      <div class="text-danger small mt-1">{errors.publishDate.message}</div>
                    )}
                  </div>

                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                      <label class="form-label mb-0" for="unpublishDate">
                        Unpublish date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!unpublishDate}
                          onClick={() => handleAddWeek('unpublishDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.unpublishDate && 'is-invalid')}
                        id="unpublishDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('unpublishDate', {
                          validate: validateUnpublishDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.unpublishDate && (
                      <div class="text-danger small mt-1">{errors.unpublishDate.message}</div>
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
              {selectedStatus === 'published' && publishDate && unpublishDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course{' '}
                  {plainDateTimeStringToDate(publishDate, courseInstance.display_timezone) < now
                    ? 'was'
                    : 'will be'}{' '}
                  published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(publishDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(unpublishDate)}
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
                      <label class="form-label mb-0" for="unpublishDate">
                        Unpublish date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!unpublishDate}
                          onClick={() => handleAddWeek('unpublishDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.unpublishDate && 'is-invalid')}
                        id="unpublishDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('unpublishDate', {
                          validate: validateUnpublishDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.unpublishDate && (
                      <div class="text-danger small mt-1">{errors.unpublishDate.message}</div>
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

        {/* Access Control Extensions Section */}
        {publishDate && (
          <>
            <hr class="my-4" />
            <QueryClientProviderDebug client={queryClient} isDevMode={false}>
              <PublishingExtensions
                courseInstance={courseInstance}
                extensions={accessControlExtensions}
                canEdit={canEdit}
                csrfToken={csrfToken}
                hasSaved={
                  !!originalPublishDate &&
                  publishDate ===
                    DateToPlainDateTime(
                      originalPublishDate,
                      courseInstance.display_timezone,
                    ).toString()
                }
              />
            </QueryClientProviderDebug>
          </>
        )}
      </div>
    </>
  );
}

PublishingForm.displayName = 'PublishingForm';
