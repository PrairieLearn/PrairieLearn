import { Temporal } from '@js-temporal/polyfill';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import { useFormContext } from 'react-hook-form';

import { type PublishingStatus, computeStatus } from '../lib/publishing.js';
import {
  dateToPlainDateTime,
  nowRoundedToSeconds,
  plainDateTimeStringToDate,
} from '../pages/instructorInstanceAdminPublishing/utils/dateUtils.js';

import { FriendlyDate } from './FriendlyDate.js';

function normalizeDateTimeLocal(value: string): string {
  // This works around a bug in Chrome where seconds are omitted from the input value when they're 0.
  // Note that this transformation will only work with a client-side POST.

  // https://stackoverflow.com/questions/19504018/show-seconds-on-input-type-date-local-in-chrome
  // https://issues.chromium.org/issues/41159420
  return value.length === 16 ? `${value}:00` : value;
}

export interface PublishingFormValues {
  start_date: string;
  end_date: string;
}

/**
 * Form for editing publishing settings for a course instance.
 *
 * This component must be wrapped in a <FormProvider> from react-hook-form. The parent component's form state should extend from
 * PublishingFormValues.
 *
 * @param params
 * @param params.displayTimezone - The timezone to display the dates in.
 * @param params.canEdit - Whether the user can edit the publishing settings.
 * @param params.originalStartDate - The original start date of the course instance.
 * @param params.originalEndDate - The original end date of the course instance.
 * @param params.showButtons - Whether to show the buttons to save and cancel.
 * @param params.formId - An unique ID for the form on the page.
 */
export function CourseInstancePublishingForm({
  displayTimezone,
  canEdit,
  originalStartDate,
  originalEndDate,
  showButtons = true,
  formId,
}: {
  displayTimezone: string;
  canEdit: boolean;
  originalStartDate: Date | null;
  originalEndDate: Date | null;
  showButtons?: boolean;
  formId: string;
}) {
  const originalStatus = computeStatus(originalStartDate, originalEndDate);

  const [selectedStatus, setSelectedStatus] = useState<PublishingStatus>(originalStatus);

  const {
    register,
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors, isDirty },
  } = useFormContext<PublishingFormValues>();

  const startDate = watch('start_date');
  const endDate = watch('end_date');

  // Update form values when status changes
  const handleStatusChange = (newStatus: PublishingStatus) => {
    setSelectedStatus(newStatus);

    const now = nowRoundedToSeconds();
    const nowTemporal = dateToPlainDateTime(now, displayTimezone);

    const oneWeekLater = nowTemporal.add({ weeks: 1 }).with({ hour: 0, minute: 1, second: 1 });
    const eighteenWeeksLater = nowTemporal
      .add({ weeks: 18 })
      .with({ hour: 23, minute: 59, second: 59 });

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
          updatedStartDate = dateToPlainDateTime(originalStartDate, displayTimezone);
          updatedEndDate = dateToPlainDateTime(originalEndDate, displayTimezone);
          break;
        }

        // If the original start date was in the past, use that.
        // Otherwise, we are transitioning from 'scheduled publish' to 'unpublished'. Drop both dates.
        if (originalStartDate && originalStartDate < now) {
          updatedStartDate = dateToPlainDateTime(originalStartDate, displayTimezone);
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
          updatedStartDate = dateToPlainDateTime(originalStartDate, displayTimezone);
          updatedEndDate = dateToPlainDateTime(originalEndDate, displayTimezone);
          break;
        }

        if (originalStartDate && now <= originalStartDate) {
          // Try to re-use the original start date if it is in the future.
          updatedStartDate = dateToPlainDateTime(originalStartDate, displayTimezone);
        } else if (
          currentStartDate === null ||
          Temporal.PlainDateTime.compare(currentStartDate, nowTemporal) <= 0
        ) {
          updatedStartDate = oneWeekLater;
        }

        if (originalEndDate && now <= originalEndDate) {
          // Try to re-use the original end date if it is in the future.
          updatedEndDate = dateToPlainDateTime(originalEndDate, displayTimezone);
        } else if (
          currentEndDate === null ||
          Temporal.PlainDateTime.compare(currentEndDate, nowTemporal) <= 0 ||
          (updatedStartDate &&
            Temporal.PlainDateTime.compare(updatedStartDate, currentEndDate) >= 0)
        ) {
          updatedEndDate = eighteenWeeksLater;
        }
        break;
      }
      case 'published': {
        if (originalStartDate && now >= originalStartDate) {
          // Try to re-use the original start date if it is in the past.
          updatedStartDate = dateToPlainDateTime(originalStartDate, displayTimezone);
        } else if (
          currentStartDate === null ||
          // If the current start date is in the future, set it to now.
          Temporal.PlainDateTime.compare(currentStartDate, nowTemporal) > 0
        ) {
          updatedStartDate = nowTemporal;
        }

        if (originalEndDate && now <= originalEndDate) {
          // Try to re-use the original end date if it is in the future.
          updatedEndDate = dateToPlainDateTime(originalEndDate, displayTimezone);
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
      const startDateTime = plainDateTimeStringToDate(value, displayTimezone);
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
        const startDateTime = plainDateTimeStringToDate(start_date, displayTimezone);
        const endDateTime = plainDateTimeStringToDate(value, displayTimezone);
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
        {/* Unpublished */}
        <div class="mb-3">
          <div class="form-check">
            <input
              class="form-check-input"
              type="radio"
              name="status"
              id={`${formId}-status-unpublished`}
              value="unpublished"
              checked={selectedStatus === 'unpublished'}
              disabled={!canEdit}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  handleStatusChange('unpublished');
                }
              }}
            />
            <label class="form-check-label" for={`${formId}-status-unpublished`}>
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
                    {plainDateTimeStringToDate(endDate, displayTimezone).getTime() ===
                      originalEndDate?.getTime() && originalStatus === 'unpublished'
                      ? 'was'
                      : 'will be'}{' '}
                    unpublished at{' '}
                    <FriendlyDate
                      date={plainDateTimeStringToDate(endDate, displayTimezone)}
                      timezone={displayTimezone}
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
              id={`${formId}-status-publish-scheduled`}
              value="publish_scheduled"
              checked={selectedStatus === 'publish_scheduled'}
              disabled={!canEdit}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  handleStatusChange('publish_scheduled');
                }
              }}
            />
            <label class="form-check-label" for={`${formId}-status-publish-scheduled`}>
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
                    timezone={displayTimezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(endDate)}
                    timezone={displayTimezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />
                  .
                </div>
              )}
              <div class="ms-4 mt-2">
                <div class="mb-3">
                  <div class="d-flex justify-content-between align-items-center">
                    <label class="form-label mb-0" for={`${formId}-start-date`}>
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
                      id={`${formId}-start-date`}
                      step="1"
                      disabled={!canEdit}
                      aria-invalid={!!errors.start_date}
                      aria-errormessage={
                        errors.start_date ? `${formId}-start-date-error` : undefined
                      }
                      {...register('start_date', {
                        validate: validateStartDate,
                        setValueAs: normalizeDateTimeLocal,
                        deps: ['end_date'],
                      })}
                    />
                    <span class="input-group-text">{displayTimezone}</span>
                  </div>
                  {errors.start_date && (
                    <div class="form-text text-danger" id={`${formId}-start-date-error`}>
                      {errors.start_date.message}
                    </div>
                  )}
                </div>

                <div class="mb-3">
                  <div class="d-flex justify-content-between align-items-center">
                    <label class="form-label mb-0" for={`${formId}-end-date`}>
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
                      id={`${formId}-end-date`}
                      step="1"
                      disabled={!canEdit}
                      aria-invalid={!!errors.end_date}
                      aria-errormessage={errors.end_date ? `${formId}-end-date-error` : undefined}
                      {...register('end_date', {
                        validate: validateEndDate,
                        setValueAs: normalizeDateTimeLocal,
                      })}
                    />
                    <span class="input-group-text">{displayTimezone}</span>
                  </div>
                  {errors.end_date && (
                    <div class="form-text text-danger" id={`${formId}-end-date-error`}>
                      {errors.end_date.message}
                    </div>
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
              id={`${formId}-status-published`}
              value="published"
              checked={selectedStatus === 'published'}
              disabled={!canEdit}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  handleStatusChange('published');
                }
              }}
            />
            <label class="form-check-label" for={`${formId}-status-published`}>
              Published
            </label>
          </div>
          {selectedStatus === 'published' && (
            <>
              {startDate && endDate && (
                <div class="ms-4 mt-1 small text-muted">
                  The course{' '}
                  {plainDateTimeStringToDate(startDate, displayTimezone).getTime() ===
                    originalStartDate?.getTime() && originalStatus === 'published'
                    ? 'was'
                    : 'will be'}{' '}
                  published at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(startDate)}
                    timezone={displayTimezone}
                    tooltip={true}
                    options={{ timeFirst: true }}
                  />{' '}
                  and will be unpublished at{' '}
                  <FriendlyDate
                    date={Temporal.PlainDateTime.from(endDate)}
                    timezone={displayTimezone}
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
                    <label class="form-label mb-0" for={`${formId}-end-date`}>
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
                      id={`${formId}-end-date`}
                      step="1"
                      disabled={!canEdit}
                      aria-invalid={!!errors.end_date}
                      aria-errormessage={errors.end_date ? `${formId}-end-date-error` : undefined}
                      {...register('end_date', {
                        validate: validateEndDate,
                        setValueAs: normalizeDateTimeLocal,
                      })}
                    />
                    <span class="input-group-text">{displayTimezone}</span>
                  </div>
                  {errors.end_date && (
                    <div class="form-text text-danger" id={`${formId}-end-date-error`}>
                      {errors.end_date.message}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {canEdit && showButtons && (
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
              reset();
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
