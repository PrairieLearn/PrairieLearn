import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type Response } from 'express';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generateSignedToken } from '@prairielearn/signed-token';

import { selectCoursesWithEditAccess } from '../models/course.js';

import { config } from './config.js';
import { type Course, type CourseInstance, type Question, type User } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface CopyTarget {
  id: string;
  short_name: string | null;
  copy_url: string;
  __csrf_token: string;
}

async function getCopyTargets({
  is_administrator,
  authn_user,
  user,
  urlSuffix,
}: {
  is_administrator: boolean;
  authn_user: User;
  user: User;
  urlSuffix: string;
}): Promise<CopyTarget[] | null> {
  const editableCourses = await selectCoursesWithEditAccess({
    user_id: user.user_id,
    is_administrator,
  });

  return editableCourses

    .filter(
      // The example course cannot be updated in the web interface.
      (editableCourse) => !editableCourse.example_course,
    )
    .map((editableCourse) => {
      const copyUrl = `/pl/course/${editableCourse.id}/${urlSuffix}`;

      // The copy form will POST to a different URL for each course, so
      // we need to generate a corresponding CSRF token for each one.
      const csrfToken = generateSignedToken(
        {
          url: copyUrl,
          authn_user_id: authn_user.user_id,
        },
        config.secretKey,
      );

      return {
        id: editableCourse.id,
        short_name: editableCourse.short_name,
        copy_url: copyUrl,
        __csrf_token: csrfToken,
      };
    });
}

export async function getQuestionCopyTargets({
  course,
  is_administrator,
  authn_user,
  user,
  question,
}: {
  course: Course;
  is_administrator: boolean;
  authn_user: User;
  user: User;
  question: Question;
}): Promise<CopyTarget[] | null> {
  if (!course.template_course && !question.share_source_publicly) {
    return null;
  }
  return getCopyTargets({
    urlSuffix: 'copy_public_question',
    is_administrator,
    authn_user,
    user,
  });
}

export async function getCourseInstanceCopyTargets({
  course,
  is_administrator,
  authn_user,
  user,
  courseInstance,
}: {
  course: Course;
  is_administrator: boolean;
  authn_user: User;
  user: User;
  courseInstance: CourseInstance;
}): Promise<CopyTarget[] | null> {
  if (!course.template_course && !courseInstance.share_source_publicly) {
    return null;
  }
  return getCopyTargets({
    urlSuffix: 'copy_public_course_instance',
    is_administrator,
    authn_user,
    user,
  });
}

async function initiateFileTransfer({
  userId,
  fromCourse,
  toCourseId,
  transferType,
  fromFilename,
}: {
  userId: string;
  fromCourse: Course;
  toCourseId: string;
  transferType: string;
  fromFilename: string;
}): Promise<string> {
  // When copying content from one course to another, instead of just directly
  // copying it, we first copy content from the source course to a temporary
  // directory, and then redirect to another URL that copies it from the temporary
  // directory into the target course. The reasons why it is done this way in the
  // first place are a little bit lost to history, but the main reason seems to be
  // related to authorization.
  //
  // Because our authorization workflow relies so heavily on middlewares, it is
  // hard to authorize a user for two separate courses at the same time. Thus, we
  // authorize them for the source course under the original URL, and then authorize
  // them for the target course under the URL we redirect to.
  //
  // In the future, if we get all of the auth code properly pulled out of middleware
  // in such a way that makes it easy to authorize multiple courses under the same
  // URL, we can consider scrapping this whole workflow and just copy the files
  // directly. This would allow us to completely get rid of the endpoints ending in
  // 'copy_public_*' and the file_transfers database table.

  const f = crypto.randomUUID();
  const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
  const params = {
    from_course_id: fromCourse.id,
    to_course_id: toCourseId,
    user_id: userId,
    transfer_type: transferType,
    from_filename: fromFilename,
    storage_filename: path.join(relDir, f.slice(6)),
  };

  await fs.cp(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
    recursive: true,
  });

  return await sqldb.queryRow(sql.insert_file_transfer, params, z.string());
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
  if (!question.qid) {
    throw new Error(`Question ${question.id} does not have a qid`);
  }

  const fromFilename = path.join(fromCourse.path, 'questions', question.qid);

  const fileTransferId = await initiateFileTransfer({
    userId: res.locals.user.user_id,
    fromCourse,
    toCourseId,
    transferType: 'CopyQuestion',
    fromFilename,
  });

  res.redirect(`${res.locals.plainUrlPrefix}/course/${toCourseId}/file_transfer/${fileTransferId}`);
}

export async function copyCourseInstanceBetweenCourses(
  res: Response,
  {
    fromCourse,
    toCourseId,
    fromCourseInstance,
  }: {
    fromCourse: Course;
    toCourseId: string;
    fromCourseInstance: CourseInstance;
  },
) {
  if (!fromCourseInstance.short_name) {
    throw new Error(`Course Instance ${fromCourseInstance.long_name} does not have a short_name`);
  }

  const fromFilename = path.join(fromCourse.path, 'courseInstances', fromCourseInstance.short_name);
  const fileTransferId = await initiateFileTransfer({
    userId: res.locals.user.user_id,
    fromCourse,
    toCourseId,
    transferType: 'CopyCourseInstance',
    fromFilename,
  });

  res.redirect(`${res.locals.plainUrlPrefix}/course/${toCourseId}/file_transfer/${fileTransferId}`);
}
