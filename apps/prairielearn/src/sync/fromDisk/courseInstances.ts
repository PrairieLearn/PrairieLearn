import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { IdSchema } from '../../lib/db-types.js';
import { type CourseInstanceJsonInput } from '../../schemas/index.js';
import { type CourseData } from '../course-db.js';
import { isAccessRuleAccessibleInFuture } from '../dates.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.filename);

/** This date is used to represent a boolean value for a date field. */
export const FUTURE_DATE = new Date(Date.UTC(2099, 11, 31));

function getParamsForCourseInstance(courseInstance: CourseInstanceJsonInput | null | undefined) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = (courseInstance.allowAccess || [])
    .filter((accessRule) => !('role' in accessRule) || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: accessRule.uids ?? null,
      start_date: accessRule.startDate ?? null,
      end_date: accessRule.endDate ?? null,
      institution: accessRule.institution ?? null,
      comment: accessRule.comment,
    }));

  const selfEnrollmentEnabledBefore = run(() => {
    if (courseInstance.enrollment?.selfEnrollmentEnabled == null) {
      courseInstance.enrollment ??= {};
      // Default value for selfEnrollmentEnabled is true.
      courseInstance.enrollment.selfEnrollmentEnabled = true;
    }

    if (typeof courseInstance.enrollment.selfEnrollmentEnabled === 'boolean') {
      // A null date is used to indicate that self-enrollment is not enabled.
      return courseInstance.enrollment.selfEnrollmentEnabled ? FUTURE_DATE.toISOString() : null;
    }
    return courseInstance.enrollment.selfEnrollmentEnabled.beforeDate;
  });

  const enrollmentLtiEnforcedAfter = run(() => {
    if (courseInstance.enrollment?.ltiEnforced == null) {
      courseInstance.enrollment ??= {};
      // Default value for ltiEnforced is false.
      courseInstance.enrollment.ltiEnforced = false;
    }

    if (typeof courseInstance.enrollment.ltiEnforced === 'boolean') {
      // A null date is used to indicate that the course instance always needs a linked LTI identity to access it.
      return courseInstance.enrollment.ltiEnforced ? null : FUTURE_DATE.toISOString();
    }
    return courseInstance.enrollment.ltiEnforced.afterDate;
  });

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
    display_timezone: courseInstance.timezone || null,
    access_rules: accessRules,
    enrollment_lti_enforced_after: enrollmentLtiEnforcedAfter,
    self_enrollment_enabled_before: selfEnrollmentEnabledBefore,
    self_enrollment_requires_secret_link:
      courseInstance.enrollment?.selfEnrollmentRequiresSecretLink ?? false,
    assessments_group_by: courseInstance.groupAssessmentsBy,
    comment: JSON.stringify(courseInstance.comment),
    share_source_publicly: courseInstance.shareSourcePublicly || false,
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
          ?.filter(isAccessRuleAccessibleInFuture)
          ?.map((accessRule) => accessRule?.institution)
          .filter((institution) => institution != null),
      );

      instanceInstitutions.forEach((institution) => {
        if (validInstitutionSet.has(institution)) return;

        infofile.addError(courseInstance, `Institution "${institution}" not found.`);
      });
    });
  }

  const courseInstanceParams = Object.entries(courseData.courseInstances).map(
    ([shortName, courseInstanceData]) => {
      const { courseInstance } = courseInstanceData;
      return JSON.stringify([
        shortName,
        courseInstance.uuid,
        infofile.stringifyErrors(courseInstance),
        infofile.stringifyWarnings(courseInstance),
        getParamsForCourseInstance(courseInstance.data),
      ]);
    },
  );

  console.log('courseInstanceParams', courseInstanceParams);

  const result = await sqldb.callRow(
    'sync_course_instances',
    [courseInstanceParams, courseId],
    z.record(z.string(), IdSchema),
  );

  return result;
}
