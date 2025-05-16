import * as path from 'node:path';

import { type Response } from 'express';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config.js';
import { type Course, type CourseInstance } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function copyCourseInstanceBetweenCourses(
  res: Response,
  {
    fromCourse,
    fromCourseInstance,
    toCourseId,
  }: {
    fromCourse: Course;
    fromCourseInstance: CourseInstance;
    toCourseId: string;
  },
) {
  // In this case, we are sending a copy of this course instance to a different course.
  //
  // Note that we *always* allow copying from a template course, even if the user
  // does not have explicit view permissions.
  if (!res.locals.authz_data.has_course_permission_view && !fromCourse.template_course) {
    throw new error.HttpStatusError(403, 'Access denied (must be a course Viewer)');
  }

  if (!fromCourseInstance.short_name) {
    throw new Error(`Course Instance ${fromCourseInstance.long_name} does not have a short_name`);
  }

  const f = uuidv4();
  const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
  const params = {
    user_id: res.locals.user.user_id,
    from_course_id: fromCourse.id,
    from_course_instance_id: fromCourseInstance.id,
    to_course_id: toCourseId,
    transfer_type: 'CopyCourseInstance',
    from_filename: path.join(fromCourse.path, 'courseInstances', fromCourseInstance.short_name),
    storage_filename: path.join(relDir, f.slice(6)),
  };

  if (config.filesRoot == null) throw new Error('config.filesRoot is null');
  await fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
  });

  const result = await sqldb.queryOneRowAsync(sql.insert_file_transfer, params);
  res.redirect(
    `${res.locals.plainUrlPrefix}/course/${toCourseId}/course_instance/file_transfer/${result.rows[0].id}`,
  );
}
