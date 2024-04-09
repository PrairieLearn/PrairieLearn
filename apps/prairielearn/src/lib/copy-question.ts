import { type Response } from 'express';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config';
import { generateSignedToken } from '@prairielearn/signed-token';
import { Course, Question } from './db-types';
import { selectCoursesWithEditAccess } from '../models/course';
import { idsEqual } from './id';

const sql = sqldb.loadSqlEquiv(__filename);

export async function setQuestionCopyTargets(res: Response) {
  // Avoid querying for editable courses if we won't be able to copy this
  // question anyways.
  if (!res.locals.course.template_course) {
    return;
  }

  const editableCourses = await selectCoursesWithEditAccess({
    user_id: res.locals.user.user_id,
    is_administrator: res.locals.is_administrator,
  });
  res.locals.question_copy_targets = editableCourses
    .filter(
      (course) =>
        // The example course cannot be updated in the web interface.
        !course.example_course &&
        // Question copying cannot be done within the same course.
        !idsEqual(course.id, res.locals.course.id),
    )
    .map((course) => {
      const copyUrl = `/pl/course/${course.id}/copy_template_course_question`;

      // The question copy form will POST to a different URL for each course, so
      // we need to generate a corresponding CSRF token for each one.
      const csrfToken = generateSignedToken(
        {
          url: copyUrl,
          authn_user_id: res.locals.authn_user.user_id,
        },
        config.secretKey,
      );

      return {
        id: course.id,
        short_name: course.short_name,
        copy_url: copyUrl,
        __csrf_token: csrfToken,
      };
    });
}

export async function copyQuestionBetweenCourses(
  res: Response,
  {
    fromCourse,
    toCourseId,
    question,
  }: {
    fromCourse: Course;
    toCourseId: string;
    question: Question;
  },
) {
  // In this case, we are sending a copy of this question to a different course.
  //
  // Note that we *always* allow copying from a template course, even if the user
  // does not have explicit view permissions.
  if (!res.locals.authz_data.has_course_permission_view && !fromCourse.template_course) {
    throw error.make(403, 'Access denied (must be a course Viewer)');
  }

  if (!question.qid) {
    throw new Error(`Question ${question.id} does not have a qid`);
  }

  const f = uuidv4();
  const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
  const params = {
    from_course_id: fromCourse.id,
    to_course_id: toCourseId,
    user_id: res.locals.user.user_id,
    transfer_type: 'CopyQuestion',
    from_filename: path.join(fromCourse.path, 'questions', question.qid),
    storage_filename: path.join(relDir, f.slice(6)),
  };

  if (config.filesRoot == null) throw new Error('config.filesRoot is null');
  await fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
  });

  const result = await sqldb.queryOneRowAsync(sql.insert_file_transfer, params);
  res.redirect(
    `${res.locals.plainUrlPrefix}/course/${params.to_course_id}/file_transfer/${result.rows[0].id}`,
  );
}
