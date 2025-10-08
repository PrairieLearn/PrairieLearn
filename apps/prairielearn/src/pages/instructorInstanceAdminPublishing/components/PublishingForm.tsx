import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../../models/course-instance-publishing-extensions.types.js';
import { nowDateInTimezone, parseDateTimeLocalString } from '../utils/dateUtils.js';

import { PublishingExtensions } from './PublishingExtensions.js';

// Create QueryClient outside component to ensure stability
const queryClient = new QueryClient();

type PublishingStatus = 'unpublished' | 'publish_scheduled' | 'published' | 'archived';

/** Helper to compute status from dates and current time. */
function computeStatus(
  publishDate: Date | null,
  archiveDate: Date | null,
  courseInstance: StaffCourseInstance,
): PublishingStatus {
  if (!publishDate && !archiveDate) {
    return 'unpublished';
  }

  const now = nowDateInTimezone(courseInstance.display_timezone);

  if (publishDate && archiveDate) {
    if (archiveDate <= now) {
      return 'archived';
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
  archiveDate: string;
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

  const originalPublishDate = courseInstance.publishing_publish_date;
  const originalArchiveDate = courseInstance.publishing_archive_date;

  const currentStatus = computeStatus(
    courseInstance.publishing_publish_date,
    courseInstance.publishing_archive_date,
    courseInstance,
  );

  const [selectedStatus, setSelectedStatus] = useState<PublishingStatus>(currentStatus);

  const defaultValues: PublishingFormValues = {
    publishDate: originalPublishDate ? originalPublishDate.toString() : '',
    archiveDate: originalArchiveDate ? originalArchiveDate.toString() : '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PublishingFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const publishDate = watch('publishDate');
  const archiveDate = watch('archiveDate');

  // Update form values when status changes
  const handleStatusChange = (newStatus: PublishingStatus) => {
    setSelectedStatus(newStatus);

    // "Now" must be rounded to the nearest second, as that's what `datetime-local` supports.
    const now = Temporal.Now.plainDateTimeISO(courseInstance.display_timezone).round({
      smallestUnit: 'seconds',
    });

    const oneWeekLater = now.add({ weeks: 1 });
    const eighteenWeeksLater = now.add({ weeks: 18 });

    const currentPublishDate = publishDate === '' ? null : Temporal.PlainDateTime.from(publishDate);
    const currentArchiveDate = archiveDate === '' ? null : Temporal.PlainDateTime.from(archiveDate);

    // Compute updated dates. We will update them at the end of this function.
    let updatedPublishDate = currentPublishDate;
    let updatedArchiveDate = currentArchiveDate;

    switch (newStatus) {
      case 'unpublished': {
        updatedPublishDate = null;
        updatedArchiveDate = null;
        break;
      }
      case 'publish_scheduled': {
        if (
          currentPublishDate === null ||
          Temporal.PlainDateTime.compare(currentPublishDate, now) <= 0
        ) {
          updatedPublishDate = oneWeekLater;
        }

        if (
          currentArchiveDate === null ||
          Temporal.PlainDateTime.compare(currentArchiveDate, now) <= 0 ||
          Temporal.PlainDateTime.compare(updatedPublishDate!, currentArchiveDate) >= 0
        ) {
          updatedArchiveDate = eighteenWeeksLater;
        }
        break;
      }
      case 'published': {
        if (
          currentPublishDate === null ||
          Temporal.PlainDateTime.compare(currentPublishDate, now) <= 0
        ) {
          updatedPublishDate = now;
        }
        if (
          currentArchiveDate === null ||
          Temporal.PlainDateTime.compare(currentArchiveDate, now) <= 0
        ) {
          updatedArchiveDate = eighteenWeeksLater;
        }
        break;
      }
      case 'archived': {
        updatedArchiveDate = now;
        if (
          currentPublishDate !== null &&
          Temporal.PlainDateTime.compare(currentPublishDate, now) > 0
        ) {
          const oneWeekAgo = now.add({ weeks: -1 });
          updatedPublishDate = oneWeekAgo;
        }
        break;
      }
    }
    setValue('publishDate', updatedPublishDate === null ? '' : updatedPublishDate.toString());
    setValue('archiveDate', updatedArchiveDate === null ? '' : updatedArchiveDate.toString());
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
          archiveDate: data.archiveDate === '' ? null : data.archiveDate,
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

  const handleAddWeek = (field: 'publishDate' | 'archiveDate') => {
    const currentValue = field === 'publishDate' ? publishDate : archiveDate;
    if (currentValue) {
      const currentDate = Temporal.PlainDateTime.from(currentValue);
      const newValue = currentDate.add({ weeks: 1 });
      setValue(field, newValue.toString());
    }
  };

  // Validation
  const validatePublishDate = (value: string) => {
    if (selectedStatus === 'publish_scheduled') {
      if (!value) {
        return 'Publish date is required for scheduled publishing';
      }
      // Check if publish date is in the future
      const publishDateTime = parseDateTimeLocalString(value, courseInstance.display_timezone);
      if (publishDateTime <= new Date()) {
        return 'Publish date must be in the future for scheduled publishing';
      }
    }
    return true;
  };

  const validateArchiveDate = (value: string) => {
    if (selectedStatus !== 'unpublished') {
      if (!value) {
        return 'Archive date is required';
      }
      // Check if archive date is after publish date
      if (publishDate && value) {
        const publishDateTime = parseDateTimeLocalString(
          publishDate,
          courseInstance.display_timezone,
        );
        const archiveDateTime = parseDateTimeLocalString(value, courseInstance.display_timezone);
        if (archiveDateTime <= publishDateTime) {
          return 'Archive date must be after publish date';
        }
      }
    }
    return true;
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
                  Course is not accessible by any students.
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
              {selectedStatus === 'publish_scheduled' && publishDate && archiveDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course will be published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(publishDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be archived at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(archiveDate)}
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
                      <label class="form-label mb-0" for="archiveDate">
                        Archive Date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!archiveDate}
                          onClick={() => handleAddWeek('archiveDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.archiveDate && 'is-invalid')}
                        id="archiveDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('archiveDate', {
                          validate: validateArchiveDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.archiveDate && (
                      <div class="text-danger small mt-1">{errors.archiveDate.message}</div>
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
              {selectedStatus === 'published' && publishDate && archiveDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course{' '}
                  {currentStatus === 'published'
                    ? parseDateTimeLocalString(publishDate, courseInstance.display_timezone) <=
                      new Date()
                      ? 'was'
                      : 'will be'
                    : 'will be'}{' '}
                  published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(publishDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be archived at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(archiveDate)}
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
                      <label class="form-label mb-0" for="archiveDate">
                        Archive Date
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          disabled={!archiveDate}
                          onClick={() => handleAddWeek('archiveDate')}
                        >
                          +1 week
                        </button>
                      )}
                    </div>
                    <div class="input-group mt-2">
                      <input
                        type="datetime-local"
                        class={clsx('form-control', errors.archiveDate && 'is-invalid')}
                        id="archiveDate"
                        step="1"
                        disabled={!canEdit}
                        {...register('archiveDate', {
                          validate: validateArchiveDate,
                        })}
                      />
                      <span class="input-group-text">{courseInstance.display_timezone}</span>
                    </div>
                    {errors.archiveDate && (
                      <div class="text-danger small mt-1">{errors.archiveDate.message}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Archived */}
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  name="status"
                  id="status-archived"
                  value="archived"
                  checked={selectedStatus === 'archived'}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                      handleStatusChange('archived');
                    }
                  }}
                />
                <label class="form-check-label" for="status-archived">
                  Archived
                </label>
              </div>
              {selectedStatus === 'archived' && archiveDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course {currentStatus === 'archived' ? 'was' : 'will be'} archived at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(archiveDate)}
                    timezone={courseInstance.display_timezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />
                  .
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
        {selectedStatus !== 'unpublished' && (
          <>
            <hr class="my-4" />
            <QueryClientProviderDebug client={queryClient} isDevMode={false}>
              <PublishingExtensions
                courseInstance={courseInstance}
                extensions={accessControlExtensions}
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
