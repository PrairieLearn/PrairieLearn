import { randomInt } from 'node:crypto';

import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { IdSchema } from '../../lib/db-types.js';
import { type CourseInstanceJson } from '../../schemas/index.js';
import { type CourseData } from '../course-db.js';
import { isAccessRuleAccessibleInFuture } from '../dates.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.filename);

export async function uniqueEnrollmentCode() {
  while (true) {
    const enrollmentCode = generateEnrollmentCode();
    const existingEnrollmentCode = await sqldb.queryOptionalRow(
      sql.select_existing_enrollment_code,
      { enrollment_code: enrollmentCode },
      z.string(),
    );
    if (existingEnrollmentCode === null) {
      return enrollmentCode;
    }
  }
}

function generateEnrollmentCode() {
  // We exclude O/0 and I/1 because they are easily confused.
  const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const totalChars = 10;
  let raw = '';
  while (raw.length < totalChars) {
    raw += allowed[randomInt(0, allowed.length)];
  }
  return raw;
}

function getParamsForCourseInstance(courseInstance: CourseInstanceJson | null | undefined) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = courseInstance.allowAccess
    .filter((accessRule) => accessRule.role == null || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: accessRule.uids ?? null,
      start_date: accessRule.startDate ?? null,
      end_date: accessRule.endDate ?? null,
      institution: accessRule.institution ?? null,
      comment: accessRule.comment,
    }));

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    hide_in_enroll_page: courseInstance.hideInEnrollPage,
    display_timezone: courseInstance.timezone ?? null,
    access_rules: accessRules,
    self_enrollment_enabled: courseInstance.selfEnrollment.enabled,
    self_enrollment_enabled_before_date: courseInstance.selfEnrollment.beforeDate,
    self_enrollment_enabled_before_date_enabled: courseInstance.selfEnrollment.beforeDateEnabled,
    self_enrollment_use_enrollment_code: courseInstance.selfEnrollment.useEnrollmentCode,
    access_control_publish_date: courseInstance.accessControl?.publishDate ?? null,
    access_control_archive_date: courseInstance.accessControl?.archiveDate ?? null,
    assessments_group_by: courseInstance.groupAssessmentsBy,
    comment: JSON.stringify(courseInstance.comment),
    share_source_publicly: courseInstance.shareSourcePublicly,
  };
}

export async function sync(
  courseId: string,
  courseData: CourseData,
): Promise<Record<string, string>> {
  if (config.checkInstitutionsOnSync) {
    // Collect all institutions from course instance access rules.
    const institutions = Object.values(courseData.courseInstances)
      .flatMap(({ courseInstance }) => courseInstance.data?.allowAccess)
      .map((accessRule) => accessRule?.institution)
      .filter((institution) => institution != null);

    // Select only the valid institution names.
    const validInstitutions = await sqldb.queryRows(
      sql.select_valid_institution_short_names,
      { short_names: Array.from(new Set(institutions)) },
      z.string(),
    );

    const validInstitutionSet = new Set(validInstitutions);

    // This is a special hardcoded value that is always valid.
    validInstitutionSet.add('Any');

    // Add sync errors for invalid institutions.
    Object.values(courseData.courseInstances).forEach(({ courseInstance }) => {
      // Note that we only emit errors for institutions referenced from access
      // rules that will be accessible at some point in the future. This lets
      // us avoid emitting errors for very old, unused course instances.
      const instanceInstitutions = new Set(
        courseInstance.data?.allowAccess
          .filter(isAccessRuleAccessibleInFuture)
          .map((accessRule) => accessRule.institution)
          .filter((institution) => institution != null),
      );

      instanceInstitutions.forEach((institution) => {
        if (validInstitutionSet.has(institution)) return;

        infofile.addError(courseInstance, `Institution "${institution}" not found.`);
      });
    });
  }

  const courseInstanceParams = await Promise.all(
    Object.entries(courseData.courseInstances).map(async ([shortName, courseInstanceData]) => {
      const { courseInstance } = courseInstanceData;
      return JSON.stringify([
        shortName,
        courseInstance.uuid,
        // This enrollment code is only used for inserts, and not used on updates
        await uniqueEnrollmentCode(),
        infofile.stringifyErrors(courseInstance),
        infofile.stringifyWarnings(courseInstance),
        getParamsForCourseInstance(courseInstance.data),
      ]);
    }),
  );

  const result = await sqldb.callRow(
    'sync_course_instances',
    [courseInstanceParams, courseId],
    z.record(z.string(), IdSchema),
  );

  return result;
}
