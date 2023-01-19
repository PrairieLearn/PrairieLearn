// @ts-check
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const infofile = require('../infofile');

const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * @param {import('../course-db').CourseData} courseData
 * @param {any} courseId
 */
module.exports.sync = async function (courseData, courseId) {
  if (infofile.hasErrors(courseData.course)) {
    const params = {
      course_id: courseId,
      sync_errors: infofile.stringifyErrors(courseData.course),
      sync_warnings: infofile.stringifyWarnings(courseData.course),
    };
    const res = await sqldb.queryZeroOrOneRowAsync(sql.update_course_errors, params);
    if (res.rowCount !== 1) throw new Error(`Unable to find course with ID ${courseId}`);
    return;
  }

  const courseInfo = courseData.course.data;
  const params = {
    course_id: courseId,
    short_name: courseInfo.name,
    title: courseInfo.title,
    display_timezone: courseInfo.timezone || null,
    grading_queue: courseInfo.name.toLowerCase().replace(' ', ''),
    example_course: courseInfo.exampleCourse,
    options: courseInfo.options || {},
    sync_warnings: infofile.stringifyWarnings(courseData.course),
  };
  const res = await sqldb.queryZeroOrOneRowAsync(sql.update_course, params);
  if (res.rowCount !== 1) throw new Error(`Unable to find course with ID ${courseId}`);
  courseInfo.timezone = res.rows[0].display_timezone;
};
