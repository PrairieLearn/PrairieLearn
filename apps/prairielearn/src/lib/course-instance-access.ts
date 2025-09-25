import { Temporal } from '@js-temporal/polyfill';

import { type AccessControlJson, type AccessRuleJson } from '../schemas/infoCourseInstance.js';

import {
  type CourseInstance,
  type CourseInstanceAccessControlExtension,
  type CourseInstanceAccessRule,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
  type EnumModeReason,
} from './db-types.js';

export interface CourseInstanceAccessParams {
  course_instance_role: EnumCourseInstanceRole;
  course_role: EnumCourseRole;
  mode_reason: EnumModeReason;
  mode: EnumMode;
  accessControlExtensions: CourseInstanceAccessControlExtension[];
}

/**
 * Evaluates whether a user can access a course instance based on the course instance's
 * access control settings and the user's authorization context.
 */
export function evaluateCourseInstanceAccess(
  courseInstance: CourseInstance,
  params: CourseInstanceAccessParams,
  // This is done like this for testing purposes.
  currentDate: Date = new Date(),
):
  | {
      hasAccess: true;
    }
  | {
      hasAccess: false;
      reason: string;
    } {
  // Staff with course or course instance roles always have access
  if (params.course_role !== 'None' || params.course_instance_role !== 'None') {
    return { hasAccess: true };
  }

  if (courseInstance.access_control_published === false) {
    return {
      hasAccess: false,
      reason: 'Course instance is not published',
    };
  }

  if (
    courseInstance.access_control_published_start_date_enabled === true &&
    courseInstance.access_control_published_start_date
  ) {
    if (currentDate < courseInstance.access_control_published_start_date) {
      return {
        hasAccess: false,
        reason: 'Course instance is not yet published',
      };
    }
  }

  // Consider the latest enabled extensions.

  const possibleEndDates = params.accessControlExtensions
    .filter((extension) => extension.enabled)
    .map((extension) => extension.published_end_date);
  if (courseInstance.access_control_published_end_date) {
    possibleEndDates.push(courseInstance.access_control_published_end_date);
  }

  const sortedPossibleEndDates = possibleEndDates.sort((a, b) => {
    return b.getTime() - a.getTime();
  });

  if (sortedPossibleEndDates.length === 0) {
    throw new Error('No possible end dates found');
  }

  if (currentDate > sortedPossibleEndDates[0]) {
    return {
      hasAccess: false,
      reason: 'Course instance has been archived',
    };
  }

  return { hasAccess: true };
}

interface CourseInstanceAccessControlExtensionData {
  enabled: boolean;
  name: string | null;
  published_end_date: string | null;
  uids: string[];
}

export interface AccessControlMigrationResult {
  success: true;
  accessControl: AccessControlJson;
  extensions: CourseInstanceAccessControlExtensionData[];
}

export interface AccessControlMigrationError {
  success: false;
  error: string;
}

export type AccessControlMigrationResponse =
  | AccessControlMigrationResult
  | AccessControlMigrationError;

const toIsoString = (date: Date, timezone: string) => {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString();
};

/**
 * Converts a database CourseInstanceAccessRule to the AccessRuleJson format.
 */
export function convertAccessRuleToJson(
  accessRule: CourseInstanceAccessRule,
  courseInstanceTimezone: string,
): AccessRuleJson {
  const json: AccessRuleJson = {};

  if (accessRule.json_comment) {
    json.comment = accessRule.json_comment;
  }

  if (accessRule.uids && accessRule.uids.length > 0) {
    json.uids = accessRule.uids;
  }

  if (accessRule.start_date) {
    json.startDate = toIsoString(accessRule.start_date, courseInstanceTimezone);
  }

  if (accessRule.end_date) {
    json.endDate = toIsoString(accessRule.end_date, courseInstanceTimezone);
  }

  if (accessRule.institution) {
    json.institution = accessRule.institution;
  }

  return json;
}

/**
 * Attempts to migrate legacy access rules (in AccessRuleJson format) to the new access control format.
 * Migrates if there is exactly one rule with valid dates. UID selectors are converted to overrides.
 */
export function migrateAccessRuleJsonToAccessControl(
  accessRules: AccessRuleJson[],
): AccessControlMigrationResponse {
  // Must have exactly one rule
  if (accessRules.length !== 1) {
    return {
      success: false,
      error: `Expected exactly 1 access rule, but found ${accessRules.length}`,
    };
  }

  const rule = accessRules[0];

  // Must have at least one date
  if (!rule.startDate && !rule.endDate) {
    return {
      success: false,
      error: 'Cannot migrate access rules without start or end dates.',
    };
  }

  // The timezone offset of dates before 1884 are a little funky (https://stackoverflow.com/a/60327839).
  // We will silently update the dates to the nearest valid date.
  if (rule.startDate && new Date(rule.startDate).getFullYear() < 1884) {
    rule.startDate = undefined;
  }

  // We can't do anything with the end date if it is before 1884.
  if (rule.endDate && new Date(rule.endDate).getFullYear() < 1884) {
    return {
      success: false,
      error: 'Cannot migrate the end date, it is too old.',
    };
  }
  // Build the new access control configuration
  const accessControl = {
    published: true, // Legacy rules imply published access
    publishedStartDateEnabled: rule.startDate !== undefined,
    publishedStartDate: rule.startDate,
    publishedEndDate: rule.endDate,
  };

  // Convert UID selectors to extensions
  const extensions: CourseInstanceAccessControlExtensionData[] = [];
  if (rule.uids && rule.uids.length > 0) {
    extensions.push({
      enabled: true,
      name: typeof rule.comment === 'string' ? rule.comment : null,
      published_end_date: rule.endDate ?? null,
      uids: rule.uids,
    });
  }

  return {
    success: true,
    accessControl,
    extensions,
  };
}
