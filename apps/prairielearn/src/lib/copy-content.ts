import * as path from 'node:path';

import { type Response } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectCoursesWithEditAccess } from '../models/course.js';
import type { CourseInstanceJsonInput } from '../schemas/infoCourseInstance.js';

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
      const csrfToken = generateCsrfToken({
        url: copyUrl,
        authnUserId: authn_user.user_id,
      });

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
  fromFolderPath,
  metadataOverrides,
}: {
  userId: string;
  fromCourse: Course;
  toCourseId: string;
  transferType: 'CopyQuestion' | 'CopyCourseInstance';
  fromFolderPath: string;
  metadataOverrides?: Record<string, any>;
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
    from_filename: fromFolderPath,
    storage_filename: path.join(relDir, f.slice(6)),
  };

  await fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {
    errorOnExist: true,
  });

  const metadataFileName =
    transferType === 'CopyQuestion' ? 'infoQuestion.json' : 'infoCourseInstance.json';

  // After we copy the contents of the directory, we apply any overrides to the metadata file.
  if (metadataOverrides) {
    const destMetadataFilePath = path.join(
      config.filesRoot,
      params.storage_filename,
      metadataFileName,
    );

    // If we have overrides for a JSON file, we need to apply them to the file.
    const metadataFileContents = await fs.readJson(
      path.join(params.from_filename, metadataFileName),
    );
    const metadataFileContentsWithOverrides = {
      ...metadataFileContents,
      ...metadataOverrides,
    };
    await fs.writeJson(destMetadataFilePath, metadataFileContentsWithOverrides, {
      spaces: 4,
    });
  }

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

  const fromFolderPath = path.join(fromCourse.path, 'questions', question.qid);

  const fileTransferId = await initiateFileTransfer({
    userId: res.locals.user.user_id,
    fromCourse,
    toCourseId,
    transferType: 'CopyQuestion',
    fromFolderPath,
  });

  res.redirect(`/pl/course/${toCourseId}/file_transfer/${fileTransferId}`);
}

export async function copyCourseInstanceBetweenCourses({
  fromCourse,
  toCourseId,
  fromCourseInstance,
  userId,
  metadataOverrides,
}: {
  fromCourse: Course;
  toCourseId: string;
  fromCourseInstance: CourseInstance;
  userId: string;
  metadataOverrides: Partial<CourseInstanceJsonInput>;
}) {
  if (!fromCourseInstance.short_name) {
    throw new Error(`Course Instance ${fromCourseInstance.long_name} does not have a short_name`);
  }

  const fromFolderPath = path.join(
    fromCourse.path,
    'courseInstances',
    fromCourseInstance.short_name,
  );
  const fileTransferId = await initiateFileTransfer({
    userId,
    fromCourse,
    toCourseId,
    transferType: 'CopyCourseInstance',
    fromFolderPath,
    metadataOverrides,
  });

  return fileTransferId;
}
