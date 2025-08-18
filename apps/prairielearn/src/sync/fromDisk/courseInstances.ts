import { randomBytes } from 'node:crypto';

import _ from 'lodash';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { IdSchema } from '../../lib/db-types.js';
import { type CourseInstanceJson } from '../../schemas/index.js';
import { type CourseData } from '../course-db.js';
import { isAccessRuleAccessibleInFuture } from '../dates.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.filename);

export function generateJoinId() {
  /** A 12-character hex string should be resistant to brute force attacks. These do not have to be unique. */
  // Similar to https://github.com/PrairieLearnInc/PrairieTest/blob/25228ee37c60b51d7d3b38240dcafa5d44bb2236/src/models/courses.ts#L526-L527
  return randomBytes(6).toString('hex');
}

function getParamsForCourseInstance(courseInstance: CourseInstanceJson | null | undefined) {
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

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
    display_timezone: courseInstance.timezone || null,
    access_rules: accessRules,
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
        // This join ID is only used for inserts, and not used on updates
        generateJoinId(),
        infofile.stringifyErrors(courseInstance),
        infofile.stringifyWarnings(courseInstance),
        getParamsForCourseInstance(courseInstance.data),
      ]);
    },
  );

  const result = await sqldb.callRow(
    'sync_course_instances',
    [courseInstanceParams, courseId],
    z.record(z.string(), IdSchema),
  );

  return result;
}
