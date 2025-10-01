import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { CourseInstance } from '../../../lib/db-types.js';
import { type CourseInstanceAccessControlExtensionWithUsers } from '../../../models/course-instance-access-control-extensions.types.js';

import { AccessControlExtensions } from './AccessControlExtensions.js';

// Create QueryClient outside component to ensure stability
const queryClient = new QueryClient();

type AccessControlStatus = 'unpublished' | 'publish_scheduled' | 'published' | 'archived';

/** Helper function to get current time in course timezone. */
function nowInTimezone(timezone: string): Temporal.Instant {
  return Temporal.Now.zonedDateTimeISO(timezone).toInstant();
}

function instantFromDate(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

function instantToString(instant: Temporal.Instant, timezone: string): string {
  // Remove seconds from the string
  // TODO: allow seconds
  return instant.toZonedDateTimeISO(timezone).toPlainDateTime().toString().slice(0, 16);
}

/** Helper function to add weeks to a datetime string. */
function addWeeksToDatetime(
  instant: Temporal.Instant,
  weeks: number,
  timezone: string,
): Temporal.Instant {
  return instant.toZonedDateTimeISO(timezone).add({ weeks }).toInstant();
}

/** Helper to compute status from dates and current time. */
function computeStatus(publishDate: Date | null, archiveDate: Date | null): AccessControlStatus {
  if (!publishDate && !archiveDate) {
    return 'unpublished';
  }

  const now = new Date();

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

interface AccessControlFormValues {
  publishDate: string;
  archiveDate: string;
}

interface AccessControlFormProps {
  courseInstance: CourseInstance;
  hasAccessRules: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  accessControlExtensions: CourseInstanceAccessControlExtensionWithUsers[];
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

  // Compute current status from database values
  const currentStatus = computeStatus(
    courseInstance.access_control_publish_date,
    courseInstance.access_control_archive_date,
  );

  // Track user-selected status (defaults to current)
  const [selectedStatus, setSelectedStatus] = useState<AccessControlStatus>(currentStatus);

  const defaultValues: AccessControlFormValues = {
    publishDate: courseInstance.access_control_publish_date
      ? Temporal.Instant.fromEpochMilliseconds(courseInstance.access_control_publish_date.getTime())
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
          .slice(0, 16)
      : '',
    archiveDate: courseInstance.access_control_archive_date
      ? Temporal.Instant.fromEpochMilliseconds(courseInstance.access_control_archive_date.getTime())
          .toZonedDateTimeISO(courseInstance.display_timezone)
          .toPlainDateTime()
          .toString()
          .slice(0, 16)
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

  const publishDate = watch('publishDate');
  const archiveDate = watch('archiveDate');

  // Store original values from database
  const originalPublishInstant = courseInstance.access_control_publish_date
    ? instantFromDate(courseInstance.access_control_publish_date)
    : null;
  const originalArchiveInstant = courseInstance.access_control_archive_date
    ? instantFromDate(courseInstance.access_control_archive_date)
    : null;

  // Update form values when status changes
  const handleStatusChange = (newStatus: AccessControlStatus) => {
    setSelectedStatus(newStatus);

    const now = nowInTimezone(courseInstance.display_timezone);
    const oneWeekLater = addWeeksToDatetime(now, 1, courseInstance.display_timezone);
    const eighteenWeeksLater = addWeeksToDatetime(now, 18, courseInstance.display_timezone);

    if (newStatus === 'unpublished') {
      setValue('publishDate', '');
      setValue('archiveDate', '');
    } else if (newStatus === 'publish_scheduled') {
      // Set publish date to now + 1 week if current publish date is not set or in the past
      let newPublishInstant: Temporal.Instant;
      const currentPublishDate = publishDate;

      if (!currentPublishDate) {
        // No publish date set, use one week from now
        newPublishInstant = oneWeekLater;
        setValue(
          'publishDate',
          instantToString(newPublishInstant, courseInstance.display_timezone),
        );
      } else {
        // Check if current publish date is in the past
        const currentPublishInstant = Temporal.PlainDateTime.from(currentPublishDate)
          .toZonedDateTime(courseInstance.display_timezone)
          .toInstant();

        if (Temporal.Instant.compare(currentPublishInstant, now) <= 0) {
          // Current publish date is in the past, set to one week from now
          newPublishInstant = oneWeekLater;
          setValue(
            'publishDate',
            instantToString(newPublishInstant, courseInstance.display_timezone),
          );
        } else {
          // Current publish date is in the future, keep it
          newPublishInstant = currentPublishInstant;
        }
      }

      // Update archive date if it's not set, or if the new publish date is >= archive date
      if (
        originalArchiveInstant === null ||
        Temporal.Instant.compare(newPublishInstant, originalArchiveInstant) >= 0
      ) {
        setValue(
          'archiveDate',
          instantToString(eighteenWeeksLater, courseInstance.display_timezone),
        );
      } else {
        setValue(
          'archiveDate',
          instantToString(originalArchiveInstant, courseInstance.display_timezone),
        );
      }
    } else if (newStatus === 'published') {
      // Set publish date to now if original was in the past or not set
      if (
        originalPublishInstant === null ||
        Temporal.Instant.compare(originalPublishInstant, now) > 0
      ) {
        setValue('publishDate', instantToString(now, courseInstance.display_timezone));
      } else {
        setValue(
          'publishDate',
          instantToString(originalPublishInstant, courseInstance.display_timezone),
        );
      }
      // Set archive date to now + 18 weeks if original was in the past or not set
      if (
        originalArchiveInstant === null ||
        Temporal.Instant.compare(originalArchiveInstant, now) <= 0
      ) {
        setValue(
          'archiveDate',
          instantToString(eighteenWeeksLater, courseInstance.display_timezone),
        );
      } else {
        setValue(
          'archiveDate',
          instantToString(originalArchiveInstant, courseInstance.display_timezone),
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (newStatus === 'archived') {
      // Set archive date to now
      setValue('archiveDate', instantToString(now, courseInstance.display_timezone));
      // Use original publish date if it's before the archive date
      if (
        originalPublishInstant !== null &&
        Temporal.Instant.compare(originalPublishInstant, now) < 0
      ) {
        setValue(
          'publishDate',
          instantToString(originalPublishInstant, courseInstance.display_timezone),
        );
      } else {
        const oneWeekAgo = addWeeksToDatetime(now, -1, courseInstance.display_timezone);
        setValue('publishDate', instantToString(oneWeekAgo, courseInstance.display_timezone));
      }
    }
  };

  const onSubmit = async (data: AccessControlFormValues) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'update_access_control',
        accessControl: {
          publishDate: data.publishDate
            ? Temporal.PlainDateTime.from(data.publishDate).toString()
            : null,
          archiveDate: data.archiveDate
            ? Temporal.PlainDateTime.from(data.archiveDate).toString()
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

  const handleAddWeek = (field: 'publishDate' | 'archiveDate') => {
    const currentValue = field === 'publishDate' ? publishDate : archiveDate;
    if (currentValue) {
      const newValue = addWeeksToDatetime(
        Temporal.Instant.from(currentValue),
        1,
        courseInstance.display_timezone,
      );
      setValue(field, instantToString(newValue, courseInstance.display_timezone));
    }
  };

  // Validation
  const validatePublishDate = (value: string) => {
    if (selectedStatus === 'publish_scheduled') {
      if (!value) {
        return 'Publish date is required for scheduled publishing';
      }
      // Check if publish date is in the future
      const now = new Date();
      const publishDateTime = new Date(value);
      if (publishDateTime <= now) {
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
        const publishDateTime = new Date(publishDate);
        const archiveDateTime = new Date(value);
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
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Publishing</h1>
        </div>
        <div class="card-body">
          {!canEdit && (
            <div class="alert alert-info" role="alert">
              You do not have permission to edit access control settings.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <input type="hidden" name="__csrf_token" value={csrfToken} />

            {/* Status Radio Buttons */}
            <div class="mb-4">
              <h5 class="mb-3">Status</h5>

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
                      date={
                        new Date(
                          Temporal.PlainDateTime.from(publishDate).toZonedDateTime(
                            courseInstance.display_timezone,
                          ).epochMilliseconds,
                        )
                      }
                      timezone={courseInstance.display_timezone}
                      tooltip={true}
                      options={{ timeFirst: true }}
                    />{' '}
                    and will be archived at{' '}
                    <FriendlyDate
                      date={
                        new Date(
                          Temporal.PlainDateTime.from(archiveDate).toZonedDateTime(
                            courseInstance.display_timezone,
                          ).epochMilliseconds,
                        )
                      }
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
                      ? new Date(publishDate) <= new Date()
                        ? 'was'
                        : 'will be'
                      : 'will be'}{' '}
                    published at{' '}
                    <FriendlyDate
                      date={
                        new Date(
                          Temporal.PlainDateTime.from(publishDate).toZonedDateTime(
                            courseInstance.display_timezone,
                          ).epochMilliseconds,
                        )
                      }
                      timezone={courseInstance.display_timezone}
                      tooltip={true}
                      options={{ timeFirst: true }}
                    />{' '}
                    and will be archived at{' '}
                    <FriendlyDate
                      date={
                        new Date(
                          Temporal.PlainDateTime.from(archiveDate).toZonedDateTime(
                            courseInstance.display_timezone,
                          ).epochMilliseconds,
                        )
                      }
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
                      date={
                        new Date(
                          Temporal.PlainDateTime.from(archiveDate).toZonedDateTime(
                            courseInstance.display_timezone,
                          ).epochMilliseconds,
                        )
                      }
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
                <AccessControlExtensions
                  courseInstance={courseInstance}
                  extensions={accessControlExtensions}
                  canEdit={canEdit}
                  csrfToken={csrfToken}
                />
              </QueryClientProviderDebug>
            </>
          )}
        </div>
      </div>
    </>
  );
}

AccessControlForm.displayName = 'AccessControlForm';
