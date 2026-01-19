import { resolve } from 'node:path';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { CourseSchema } from '../../lib/db-types.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

function isExampleCourse(courseDir: string): boolean {
  /* The example course is identified by its path relative to the repository
   * root. When the course is tagged as an example course, it will be treated
   * specially in various parts of the system. In particular:
   *
   * - Any user with staff permission in any course automatically gets viewer access to the example course;
   * - Nobody can modify the example course content in the Web UI (admins and editors can at most sync);
   * - The home page always shows the example course question in the list of courses with staff access, as long as one more course is listed;
   * - Questions in the example course with QID starting in template/ are shown as templates everywhere;
   * - Non-admins cannot change to a different effective user in the example course;
   * - Variants in example course questions are only visible to the variant's creator, even if the current user has staff access;
   * - Only administrators get API access to the example course.
   */
  return (
    resolve(REPOSITORY_ROOT_PATH, config.exampleCoursePath) ===
    resolve(REPOSITORY_ROOT_PATH, courseDir)
  );
}

export async function sync(courseDir: string, courseData: CourseData, courseId: string) {
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
      example_course: isExampleCourse(courseDir),
      options: courseInfo.options,
      comment: JSON.stringify(courseInfo.comment),
      sync_warnings: infofile.stringifyWarnings(courseData.course),
    },
    CourseSchema,
  );
  courseInfo.timezone = course.display_timezone;
}
