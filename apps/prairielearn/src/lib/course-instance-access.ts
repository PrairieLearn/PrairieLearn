import {
  type CourseInstance,
  type CourseInstanceAccessRule,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
  type EnumModeReason,
} from './db-types.js';
import { type AccessRuleJson } from '../schemas/infoCourseInstance.js';

export interface CourseInstanceAccessParams {
  course_instance_role: EnumCourseInstanceRole;
  course_role: EnumCourseRole;
  mode_reason: EnumModeReason;
  mode: EnumMode;
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

  if (courseInstance.access_control_published_end_date) {
    if (currentDate > courseInstance.access_control_published_end_date) {
      return {
        hasAccess: false,
        reason: 'Course instance has been archived',
      };
    }
  }

  return { hasAccess: true };
}

export interface AccessControlMigrationResult {
  success: true;
  accessControl: {
    published: boolean;
    publishedStartDateEnabled: boolean;
    publishedStartDate: Date | null;
    publishedEndDate: Date | null;
  };
}

export interface AccessControlMigrationError {
  success: false;
  error: string;
}

export type AccessControlMigrationResponse =
  | AccessControlMigrationResult
  | AccessControlMigrationError;

/**
 * Converts a database CourseInstanceAccessRule to the AccessRuleJson format.
 */
export function convertAccessRuleToJson(accessRule: CourseInstanceAccessRule): AccessRuleJson {
  const json: AccessRuleJson = {};

  if (accessRule.json_comment) {
    json.comment = accessRule.json_comment;
  }

  if (accessRule.uids && accessRule.uids.length > 0) {
    json.uids = accessRule.uids;
  }

  if (accessRule.start_date) {
    json.startDate = accessRule.start_date.toISOString();
  }

  if (accessRule.end_date) {
    json.endDate = accessRule.end_date.toISOString();
  }

  if (accessRule.institution) {
    json.institution = accessRule.institution;
  }

  return json;
}

/**
 * Attempts to migrate legacy access rules to the new access control format.
 * Only migrates if there is exactly one rule with no UID selector and valid dates.
 */
export function migrateAccessRulesToAccessControl(
  accessRules: CourseInstanceAccessRule[],
): AccessControlMigrationResponse {
  // Must have exactly one rule
  if (accessRules.length !== 1) {
    return {
      success: false,
      error: `Expected exactly 1 access rule, but found ${accessRules.length}`,
    };
  }

  const rule = accessRules[0];

  // Must not have UID selector (global rule)
  if (rule.uids !== null && rule.uids.length > 0) {
    return {
      success: false,
      error: 'Cannot migrate access rules with UID selectors. Only global rules can be migrated.',
    };
  }

  // Must have at least one date
  if (rule.start_date === null && rule.end_date === null) {
    return {
      success: false,
      error: 'Cannot migrate access rules without start or end dates.',
    };
  }

  // Build the new access control configuration
  const accessControl = {
    published: true, // Legacy rules imply published access
    publishedStartDateEnabled: rule.start_date !== null,
    publishedStartDate: rule.start_date,
    publishedEndDate: rule.end_date,
  };

  return {
    success: true,
    accessControl,
  };
}
