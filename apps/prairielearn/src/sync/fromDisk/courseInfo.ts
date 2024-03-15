import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { CourseData } from '../course-db';

const sql = sqldb.loadSqlEquiv(__filename);

export async function sync(courseData: CourseData, courseId: string) {
  if (infofile.hasErrors(courseData.course)) {
    const res = await sqldb.queryZeroOrOneRowAsync(sql.update_course_errors, {
      course_id: courseId,
      sync_errors: infofile.stringifyErrors(courseData.course),
      sync_warnings: infofile.stringifyWarnings(courseData.course),
    });
    if (res.rowCount !== 1) throw new Error(`Unable to find course with ID ${courseId}`);
    return;
  }

  const courseInfo = courseData.course.data;
  if (!courseInfo) {
    throw new Error('Course info file is missing data');
  }

  const res = await sqldb.queryZeroOrOneRowAsync(sql.update_course, {
    course_id: courseId,
    short_name: courseInfo.name,
    title: courseInfo.title,
    display_timezone: courseInfo.timezone || null,
    example_course: courseInfo.exampleCourse,
    options: courseInfo.options || {},
    sync_warnings: infofile.stringifyWarnings(courseData.course),
  });
  if (res.rowCount !== 1) throw new Error(`Unable to find course with ID ${courseId}`);
  courseInfo.timezone = res.rows[0].display_timezone;
}
