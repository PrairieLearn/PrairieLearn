import _ from 'lodash';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { CourseData, CourseInstance } from '../course-db.js';
import * as infofile from '../infofile.js';

function getParamsForCourseInstance(courseInstance: CourseInstance | null | undefined) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = (courseInstance.allowAccess || [])
    .filter((accessRule) => !_.has(accessRule, 'role') || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: _.has(accessRule, 'uids') ? accessRule.uids : null,
      start_date: _.has(accessRule, 'startDate') ? accessRule.startDate : null,
      end_date: _.has(accessRule, 'endDate') ? accessRule.endDate : null,
      institution: _.has(accessRule, 'institution') ? accessRule.institution : null,
    }));

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    number: courseInstance.number,
    hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
    display_timezone: courseInstance.timezone || null,
    access_rules: accessRules,
    assessments_group_by: courseInstance.groupAssessmentsBy,
    shared_publicly: courseInstance.sharedPublicly || false,
  };
}

export async function sync(
  courseId: string,
  courseData: CourseData,
): Promise<Record<string, string>> {
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

  const result = await sqldb.callRow(
    'sync_course_instances',
    [courseInstanceParams, courseId],
    z.record(z.string(), IdSchema),
  );

  return result;
}
