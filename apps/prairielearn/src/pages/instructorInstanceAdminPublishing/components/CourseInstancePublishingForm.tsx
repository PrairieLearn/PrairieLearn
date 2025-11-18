import { Temporal } from '@js-temporal/polyfill';
import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useForm } from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import type { StaffCourseInstance } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { CourseInstancePublishingExtensionWithUsers } from '../instructorInstanceAdminPublishing.types.js';
import {
  dateToPlainDateTime,
  nowRoundedToSeconds,
  plainDateTimeStringToDate,
} from '../utils/dateUtils.js';

import { PublishingExtensions } from './PublishingExtensions.js';

const queryClient = new QueryClient();

type PublishingStatus = 'unpublished' | 'publish_scheduled' | 'published';

/** Helper to compute status from dates and current time. */
function computeStatus(startDate: Date | null, endDate: Date | null): PublishingStatus {
  if (!startDate && !endDate) {
    return 'unpublished';
  }

  const now = nowRoundedToSeconds();

  if (startDate && endDate) {
    if (endDate <= now) {
      return 'unpublished';
    }
    if (startDate > now) {
      return 'publish_scheduled';
    }
    return 'published';
  }

  // Should not happen in valid states, but default to unpublished
  return 'unpublished';
}

interface PublishingFormValues {
  start_date: string;
  end_date: string;
}

export function CourseInstancePublishingForm({
  courseInstance,
  canEdit,
  csrfToken,
  origHash,
  publishingExtensions,
  isDevMode,
}: {
  courseInstance: StaffCourseInstance;
  canEdit: boolean;
  csrfToken: string;
  origHash: string | null;
  publishingExtensions: CourseInstancePublishingExtensionWithUsers[];
  isDevMode: boolean;
}) {
  const originalStartDate = courseInstance.publishing_start_date;
  const originalEndDate = courseInstance.publishing_end_date;

  const originalStatus = computeStatus(
    courseInstance.publishing_start_date,
    courseInstance.publishing_end_date,
  );

  const [selectedStatus, setSelectedStatus] = useState<PublishingStatus>(originalStatus);

  const defaultValues: PublishingFormValues = {
    start_date: originalStartDate
      ? dateToPlainDateTime(originalStartDate, courseInstance.display_timezone).toString()
      : '',
    end_date: originalEndDate
      ? dateToPlainDateTime(originalEndDate, courseInstance.display_timezone).toString()
      : '',
  };

  const {
    register,
    watch,
    setValue,
    trigger,
    formState: { errors, isDirty, isValid },
  } = useForm<PublishingFormValues>({
    mode: 'onChange',
    defaultValues,
  });

  const startDate = watch('start_date');
  const endDate = watch('end_date');

  const onSubmit = (e: SubmitEvent) => {
    if (!isValid) {
      e.preventDefault();
      return;
    }
  };

  // Update form values when status changes
  const handleStatusChange = (newStatus: PublishingStatus) => {
    setSelectedStatus(newStatus);

    const now = nowRoundedToSeconds();
    const nowTemporal = dateToPlainDateTime(now, courseInstance.display_timezone);

    const oneWeekLater = nowTemporal.add({ weeks: 1 });
    const eighteenWeeksLater = nowTemporal.add({ weeks: 18 });

    const currentStartDate = startDate === '' ? null : Temporal.PlainDateTime.from(startDate);
    const currentEndDate = endDate === '' ? null : Temporal.PlainDateTime.from(endDate);

    // Compute updated dates. We will update them at the end of this function.
    let updatedStartDate = currentStartDate;
    let updatedEndDate = currentEndDate;

    switch (newStatus) {
      case 'unpublished': {
        // If the original dates from the form put the course instance in an unpublished state,
        // use those dates.
        if (originalStartDate && originalEndDate && now >= originalEndDate) {
          updatedStartDate = dateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
          updatedEndDate = dateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
          break;
        }

        // If the original start date was in the past, use that.
        // Otherwise, we are transitioning from 'scheduled publish' to 'unpublished'. Drop both dates.
        if (originalStartDate && originalStartDate < now) {
          updatedStartDate = dateToPlainDateTime(
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
        // If the original dates from the form put the course instance in a scheduled publish state,
        // use those dates.
        if (originalStartDate && originalEndDate && now <= originalStartDate) {
          updatedStartDate = dateToPlainDateTime(
            originalStartDate,
            courseInstance.display_timezone,
          );
          updatedEndDate = dateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
          break;
        }

        if (originalStartDate && now <= originalStartDate) {
          // Try to re-use the original start date if it is in the future.
          updatedStartDate = dateToPlainDateTime(
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
          updatedEndDate = dateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
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
          updatedStartDate = dateToPlainDateTime(
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
          updatedEndDate = dateToPlainDateTime(originalEndDate, courseInstance.display_timezone);
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
    setValue('start_date', updatedStartDate?.toString() ?? '', { shouldDirty: true });
    setValue('end_date', updatedEndDate?.toString() ?? '', { shouldDirty: true });
  };

  const handleAddWeek = async (field: 'start_date' | 'end_date') => {
    const currentDate = Temporal.PlainDateTime.from(field === 'start_date' ? startDate : endDate);
    const newValue = currentDate.add({ weeks: 1 });
    setValue(field, newValue.toString(), { shouldDirty: true });
    // setValue with { shouldValidate: true } doesn't trigger dependent inputs to validate.
    await trigger('start_date');
    await trigger('end_date');
  };

  // Validation
  const validateStartDate = (value: string) => {
    if (selectedStatus === 'publish_scheduled') {
      if (!value) {
        return 'Start date is required for scheduled publishing';
      }
      // Check if start date is in the future
      const startDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
      if (startDateTime <= nowRoundedToSeconds()) {
        return 'Start date must be in the future for scheduled publishing';
      }
    }
    return true;
  };

  const validateEndDate = (value: string, { start_date }: { start_date: string }) => {
    if (selectedStatus !== 'unpublished') {
      if (!value) {
        return 'End date is required';
      }
      // Check if end date is after start date
      if (start_date) {
        const startDateTime = plainDateTimeStringToDate(
          start_date,
          courseInstance.display_timezone,
        );
        const endDateTime = plainDateTimeStringToDate(value, courseInstance.display_timezone);
        if (endDateTime <= startDateTime) {
          return 'End date must be after start date';
        }
      }
    }
    return true;
  };

  return (
    <>
      <div class="mb-4">
        <h4 class="mb-4">Publishing</h4>

        {!canEdit && origHash !== null && (
          <div class="alert alert-info" role="alert">
            You do not have permission to edit publishing settings.
          </div>
        )}
        {!canEdit && origHash === null && (
          <div class="alert alert-warning" role="alert">
            You cannot edit publishing settings because the <code>infoCourseInstance.json</code>{' '}
            file does not exist.
          </div>
        )}

        <form method="POST" onSubmit={onSubmit}>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="__action" value="update_publishing" />
          <input type="hidden" name="orig_hash" value={origHash ?? ''} />

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
                    if (e.currentTarget.checked) {
                      handleStatusChange('unpublished');
                    }
                  }}
                />
                <label class="form-check-label" for="status-unpublished">
                  Unpublished
                </label>
              </div>
              {selectedStatus === 'unpublished' && (
                <>
                  <input type="hidden" name="start_date" value={startDate} />
                  <input type="hidden" name="end_date" value={endDate} />
                  <div class="ms-4 mt-1 small text-muted">
                    Course is not accessible by any students
                    {startDate && ' except those with extensions'}.
                    {endDate && (
                      <>
                        <br />
                        The course{' '}
                        {plainDateTimeStringToDate(
                          endDate,
                          courseInstance.display_timezone,
                        ).getTime() === originalEndDate?.getTime() &&
                        originalStatus === 'unpublished'
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
                </>
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
                    if (e.currentTarget.checked) {
                      handleStatusChange('publish_scheduled');
                    }
                  }}
                />
                <label class="form-check-label" for="status-publish-scheduled">
                  Scheduled to be published
                </label>
              </div>

              {selectedStatus === 'publish_scheduled' && (
                <>
                  {startDate && endDate && (
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
                  <div class="ms-4 mt-2">
                    <div class="mb-3">
                      <div class="d-flex justify-content-between align-items-center">
                        <label class="form-label mb-0" for="start_date">
                          Start date
                        </label>
                        {canEdit && (
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            disabled={!startDate}
                            onClick={() => handleAddWeek('start_date')}
                          >
                            +1 week
                          </button>
                        )}
                      </div>
                      <div class="input-group mt-2">
                        <input
                          type="datetime-local"
                          class={clsx('form-control', errors.start_date && 'is-invalid')}
                          id="start_date"
                          step="1"
                          disabled={!canEdit}
                          {...register('start_date', {
                            validate: validateStartDate,
                            deps: ['end_date'],
                          })}
                        />
                        <span class="input-group-text">{courseInstance.display_timezone}</span>
                      </div>
                      {errors.start_date && (
                        <div class="text-danger small mt-1">{errors.start_date.message}</div>
                      )}
                    </div>

                    <div class="mb-3">
                      <div class="d-flex justify-content-between align-items-center">
                        <label class="form-label mb-0" for="end_date">
                          End date
                        </label>
                        {canEdit && (
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            disabled={!endDate}
                            onClick={() => handleAddWeek('end_date')}
                          >
                            +1 week
                          </button>
                        )}
                      </div>
                      <div class="input-group mt-2">
                        <input
                          type="datetime-local"
                          class={clsx('form-control', errors.end_date && 'is-invalid')}
                          id="end_date"
                          step="1"
                          disabled={!canEdit}
                          {...register('end_date', {
                            validate: validateEndDate,
                          })}
                        />
                        <span class="input-group-text">{courseInstance.display_timezone}</span>
                      </div>
                      {errors.end_date && (
                        <div class="text-danger small mt-1">{errors.end_date.message}</div>
                      )}
                    </div>
                  </div>
                </>
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
                    if (e.currentTarget.checked) {
                      handleStatusChange('published');
                    }
                  }}
                />
                <label class="form-check-label" for="status-published">
                  Published
                </label>
              </div>
              {selectedStatus === 'published' && (
                <>
                  {startDate && endDate && (
                    <div class="ms-4 mt-1 small text-muted">
                      The course{' '}
                      {plainDateTimeStringToDate(
                        startDate,
                        courseInstance.display_timezone,
                      ).getTime() === originalStartDate?.getTime() && originalStatus === 'published'
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
                  <input type="hidden" name="start_date" value={startDate} />
                  <div class="ms-4 mt-2">
                    <div class="mb-3">
                      <div class="d-flex justify-content-between align-items-center">
                        <label class="form-label mb-0" for="end_date">
                          End date
                        </label>
                        {canEdit && (
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            disabled={!endDate}
                            onClick={() => handleAddWeek('end_date')}
                          >
                            +1 week
                          </button>
                        )}
                      </div>
                      <div class="input-group mt-2">
                        <input
                          type="datetime-local"
                          class={clsx('form-control', errors.end_date && 'is-invalid')}
                          id="end_date"
                          step="1"
                          disabled={!canEdit}
                          {...register('end_date', {
                            validate: validateEndDate,
                          })}
                        />
                        <span class="input-group-text">{courseInstance.display_timezone}</span>
                      </div>
                      {errors.end_date && (
                        <div class="text-danger small mt-1">{errors.end_date.message}</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {canEdit && (
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-primary" disabled={!isDirty}>
                Save
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                disabled={!isDirty}
                onClick={() => {
                  setSelectedStatus(originalStatus);
                  setValue(
                    'start_date',
                    originalStartDate
                      ? dateToPlainDateTime(
                          originalStartDate,
                          courseInstance.display_timezone,
                        ).toString()
                      : '',
                    {
                      shouldDirty: true,
                    },
                  );
                  setValue(
                    'end_date',
                    originalEndDate
                      ? dateToPlainDateTime(
                          originalEndDate,
                          courseInstance.display_timezone,
                        ).toString()
                      : '',
                    { shouldDirty: true },
                  );
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

CourseInstancePublishingForm.displayName = 'CourseInstancePublishingForm';
