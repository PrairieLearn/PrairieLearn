import { type Response } from 'express';
import fs = require('fs-extra');
import path = require('node:path');
import { v4 as uuidv4 } from 'uuid';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config';
import { generateSignedToken } from '@prairielearn/signed-token';
import { Course } from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

export function setQuestionCopyTargets(res: Response) {
  if (!res.locals.course.template_course) {
    res.locals.question_copy_targets = [];
    return;
  }

  res.locals.question_copy_targets = res.locals.authz_data.editable_courses.map((course) => {
    const transferUrl = `/pl/course/${course.id}/transfer_template_course_question`;
    const csrfToken = generateSignedToken(
      {
        url: transferUrl,
        authn_user_id: res.locals.authn_user.user_id,
      },
      config.secretKey
    );
    return {
      id: course.id,
      short_name: course.short_name,
      transfer_url: transferUrl,
      __csrf_token: csrfToken,
    };
  });
}

export async function copyQuestionBetweenCourses(
  res: Response,
  { fromCourse, toCourseId }: { fromCourse: Course; toCourseId: string }
) {
  // In this case, we are sending a copy of this question to a different course.
  //
  // Note that we *always* allow copying from a template course, even if the user
  // does not have explicit view permissions.
  if (!res.locals.authz_data.has_course_permission_view && !fromCourse.template_course) {
    throw error.make(403, 'Access denied (must be a course Viewer)');
  }

  if (!fromCourse.path) {
    throw new Error(`Course ${fromCourse.id} does not have a path`);
  }

  const f = uuidv4();
  const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
  const params = {
    from_course_id: fromCourse.id,
    to_course_id: toCourseId,
    user_id: res.locals.user.user_id,
    transfer_type: 'CopyQuestion',
    from_filename: path.join(fromCourse.path, 'questions', res.locals.question.qid),
    storage_filename: path.join(relDir, f.slice(6)),
  };

  if (config.filesRoot == null) throw new Error('config.filesRoot is null');
  await fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
  });

  const result = await sqldb.queryOneRowAsync(sql.insert_file_transfer, params);
  res.redirect(
    `${res.locals.plainUrlPrefix}/course/${params.to_course_id}/file_transfer/${result.rows[0].id}`
  );
}
