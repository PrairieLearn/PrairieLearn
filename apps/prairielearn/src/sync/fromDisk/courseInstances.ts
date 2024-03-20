import _ = require('lodash');
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { makePerformance } from '../performance';
import { CourseData, CourseInstance } from '../course-db';
import { IdSchema } from '../../lib/db-types';

const perf = makePerformance('courseInstances');

function getParamsForCourseInstance(courseInstance: CourseInstance | null | undefined) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = (courseInstance.allowAccess || [])
    .filter((accessRule) => !_(accessRule).has('role') || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: _(accessRule).has('uids') ? accessRule.uids : null,
      start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
      end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
      institution: _(accessRule).has('institution') ? accessRule.institution : null,
    }));

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    number: courseInstance.number,
    hide_in_enroll_page: courseInstance.hideInEnrollPage || false,
    display_timezone: courseInstance.timezone || null,
    access_rules: accessRules,
    assessments_group_by: courseInstance.groupAssessmentsBy,
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

  perf.start('sproc:sync_course_instances');
  const result = await sqldb.callRow(
    'sync_course_instances',
    [courseInstanceParams, courseId],
    z.record(z.string(), IdSchema),
  );
  perf.end('sproc:sync_course_instances');

  return result;
}
