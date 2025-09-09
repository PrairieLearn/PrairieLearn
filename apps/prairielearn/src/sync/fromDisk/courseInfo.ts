import * as sqldb from '@prairielearn/postgres';

import { CourseSchema } from '../../lib/db-types.js';
import type { CourseJson } from '../../schemas/infoCourse.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function isExampleCourse(courseInfo: CourseJson): boolean {
  return (
    courseInfo.uuid === 'fcc5282c-a752-4146-9bd6-ee19aac53fc5' &&
    courseInfo.title === 'Example Course' &&
    courseInfo.name === 'XC 101'
  );
}

export async function sync(courseData: CourseData, courseId: string) {
  if (infofile.hasErrors(courseData.course)) {
    const rowCount = await sqldb.execute(sql.update_course_errors, {
      course_id: courseId,
      sync_errors: infofile.stringifyErrors(courseData.course),
      sync_warnings: infofile.stringifyWarnings(courseData.course),
    });
    if (rowCount !== 1) throw new Error(`Unable to find course with ID ${courseId}`);
    return;
  }

  const courseInfo = courseData.course.data;
  if (!courseInfo) {
    throw new Error('Course info file is missing data');
  }

  const course = await sqldb.queryRow(
    sql.update_course,
    {
      course_id: courseId,
      short_name: courseInfo.name,
      title: courseInfo.title,
      display_timezone: courseInfo.timezone ?? null,
      example_course: isExampleCourse(courseInfo),
      options: courseInfo.options,
      comment: JSON.stringify(courseInfo.comment),
      sync_warnings: infofile.stringifyWarnings(courseData.course),
    },
    CourseSchema,
  );
  courseInfo.timezone = course.display_timezone;
}
