import { Temporal } from '@js-temporal/polyfill';

import type { StaffCourseInstance } from './safe-db-types.js';

export function dateToZonedDateTime(date: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timezone);
}

export interface TemporalStaffCourseInstance
  extends Omit<
    StaffCourseInstance,
    | 'publishing_publish_date'
    | 'publishing_archive_date'
    | 'deleted_at'
    | 'self_enrollment_enabled_before_date'
  > {
  publishing_publish_date: Temporal.ZonedDateTime | null;
  publishing_archive_date: Temporal.ZonedDateTime | null;
  deleted_at: Temporal.ZonedDateTime | null;
  self_enrollment_enabled_before_date: Temporal.ZonedDateTime | null;
}

/**
 * Converts all dates in a course instance to Temporal.ZonedDateTime.
 */
export function toTemporalCourseInstance(
  courseInstance: StaffCourseInstance,
): TemporalStaffCourseInstance {
  return {
    ...courseInstance,
    deleted_at: courseInstance.deleted_at
      ? dateToZonedDateTime(courseInstance.deleted_at, courseInstance.display_timezone)
      : null,
    publishing_publish_date: courseInstance.publishing_publish_date
      ? dateToZonedDateTime(courseInstance.publishing_publish_date, courseInstance.display_timezone)
      : null,
    publishing_archive_date: courseInstance.publishing_archive_date
      ? dateToZonedDateTime(courseInstance.publishing_archive_date, courseInstance.display_timezone)
      : null,
    self_enrollment_enabled_before_date: courseInstance.self_enrollment_enabled_before_date
      ? dateToZonedDateTime(
          courseInstance.self_enrollment_enabled_before_date,
          courseInstance.display_timezone,
        )
      : null,
  };
}
