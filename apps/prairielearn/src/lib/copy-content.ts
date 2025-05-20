import * as path from 'node:path';

import { type Response } from 'express';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generateSignedToken } from '@prairielearn/signed-token';

import { selectCoursesWithEditAccess } from '../models/course.js';

import { config } from './config.js';
import { type Course, type CourseInstance, type Question } from './db-types.js';
import { idsEqual } from './id.js';

export interface CopyTarget {
  id: string;
  short_name: string | null;
  copy_url: string;
  __csrf_token: string;
}

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getCopyTargets(res: Response, urlSuffix: string): Promise<CopyTarget[] | null> {
  const editableCourses = await selectCoursesWithEditAccess({
    user_id: res.locals.user.user_id,
    is_administrator: res.locals.is_administrator,
  });

  return editableCourses
    .filter(
      (course) =>
        // The example course cannot be updated in the web interface.
        !course.example_course &&
        // Question copying cannot be done within the same course.
        !idsEqual(course.id, res.locals.course.id),
    )
    .map((course) => {
      const copyUrl = `/pl/course/${course.id}/${urlSuffix}`;

      // The copy form will POST to a different URL for each course, so
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

export async function getQuestionCopyTargets(res: Response): Promise<CopyTarget[] | null> {
  if (!res.locals.course.template_course && !res.locals.question.share_source_publicly) {
    return null;
  }
  return getCopyTargets(res, 'copy_public_question');
}

export async function getCourseInstanceCopyTargets(res: Response): Promise<CopyTarget[] | null> {
  if (!res.locals.course.template_course && !res.locals.course_instance.share_source_publicly) {
    return null;
  }
  return getCopyTargets(res, 'copy_public_course_instance');
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
  const f = uuidv4();
  const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
  const params = {
    from_course_id: fromCourse.id,
    to_course_id: toCourseId,
    user_id: userId,
    transfer_type: transferType,
    from_filename: fromFilename,
    storage_filename: path.join(relDir, f.slice(6)),
  };

  if (config.filesRoot == null) throw new Error('config.filesRoot is null');
  await fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
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
