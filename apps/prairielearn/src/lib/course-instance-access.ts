import { Temporal } from '@js-temporal/polyfill';

import { type AccessRuleJson, type PublishingJson } from '../schemas/infoCourseInstance.js';

import { type CourseInstanceAccessRule } from './db-types.js';

export interface PublishingConfigurationMigrationResult {
  success: true;
  publishingConfiguration: PublishingJson;
}

export interface PublishingConfigurationMigrationError {
  success: false;
  error: string;
}

export type PublishingConfigurationMigrationResponse =
  | PublishingConfigurationMigrationResult
  | PublishingConfigurationMigrationError;

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
 * Attempts to migrate legacy access rules (in AccessRuleJson format) to the new publishing configuration format.
 * Uses the earliest start date and latest end date to determine the publishing configuration.
 */
export function migrateAccessRuleJsonToPublishingConfiguration(
  originalAccessRules: AccessRuleJson[],
): PublishingConfigurationMigrationResponse {
  // Make a deep copy of the access rules
  const accessRules = structuredClone(originalAccessRules);

  const startDates = accessRules
    .map((rule) => rule.startDate)
    .filter((date) => date != null)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const endDates = accessRules
    .map((rule) => rule.endDate)
    .filter((date) => date != null)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  let earliestStartDate = startDates.length > 0 ? startDates[0] : null;
  const latestEndDate = endDates.length > 0 ? endDates[endDates.length - 1] : null;

  // Must have both dates or neither
  if (!earliestStartDate || !latestEndDate) {
    return {
      success: false,
      error:
        'Cannot migrate access rules since there is no start or end date that can be inferred.',
    };
  }
  // The timezone offset of dates before 1884 are a little funky (https://stackoverflow.com/a/60327839).
  // We will silently update the dates to the nearest valid date.
  if (earliestStartDate && new Date(earliestStartDate).getFullYear() < 1884) {
    earliestStartDate = '2000-01-01T00:00:00';
  }

  // We can't do anything with the end date if it is before 1884.
  if (latestEndDate && new Date(latestEndDate).getFullYear() < 1884) {
    return {
      success: false,
      error: 'Cannot migrate the end date, it is too old.',
    };
  }
  // Build the new access control configuration
  const publishingConfiguration = {
    startDate: earliestStartDate,
    endDate: latestEndDate,
  };

  return {
    success: true,
    publishingConfiguration,
  };
}
