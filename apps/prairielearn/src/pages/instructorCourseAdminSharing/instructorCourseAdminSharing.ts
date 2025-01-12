import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getCanonicalHost } from '../../lib/url.js';

import {
  InstructorCourseAdminSharing,
  SharingSetRowSchema,
} from './instructorCourseAdminSharing.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function selectCanChooseSharingName(course) {
  return (
    course.sharing_name === null ||
    !(await sqldb.queryOptionalRow(
      sql.select_shared_question_exists,
      {
        course_id: course.id,
      },
      z.boolean().nullable(),
    ))
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const sharingSets = await sqldb.queryRows(
      sql.select_sharing_sets,
      { course_id: res.locals.course.id },
      SharingSetRowSchema,
    );

    const host = getCanonicalHost(req);
    const publicSharingLink = new URL(
      `${res.locals.plainUrlPrefix}/public/course/${res.locals.course.id}/questions`,
      host,
    ).href;

    const canChooseSharingName = await selectCanChooseSharingName(res.locals.course);

    res.send(
      InstructorCourseAdminSharing({
        sharingName: res.locals.course.sharing_name,
        sharingToken: res.locals.course.sharing_token,
        sharingSets,
        publicSharingLink,
        canChooseSharingName,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw new error.HttpStatusError(403, 'Access denied (must be course owner)');
    }
    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    if (req.body.__action === 'sharing_token_regenerate') {
      await sqldb.queryZeroOrOneRowAsync(sql.update_sharing_token, {
        course_id: res.locals.course.id,
      });
    } else if (req.body.__action === 'course_sharing_set_add') {
      const consuming_course_id = await sqldb.queryOptionalRow(
        sql.course_sharing_set_add,
        {
          sharing_course_id: res.locals.course.id,
          unsafe_sharing_set_id: req.body.unsafe_sharing_set_id,
          unsafe_course_sharing_token: req.body.unsafe_course_sharing_token,
        },
        z.string().nullable(),
      );
      if (consuming_course_id === null) {
        throw new error.HttpStatusError(400, 'Failed to add course to sharing set.');
      }
    } else if (req.body.__action === 'choose_sharing_name') {
      if (
        req.body.course_sharing_name.includes('/') ||
        req.body.course_sharing_name.includes('@') ||
        req.body.course_sharing_name === ''
      ) {
        throw new error.HttpStatusError(
          400,
          'Course Sharing Name must be non-empty and is not allowed to contain "/" or "@".',
        );
      } else {
        const canChooseSharingName = await selectCanChooseSharingName(res.locals.course);
        if (canChooseSharingName) {
          await sqldb.queryZeroOrOneRowAsync(sql.choose_sharing_name, {
            sharing_name: req.body.course_sharing_name.trim(),
            course_id: res.locals.course.id,
          });
        } else {
          throw new error.HttpStatusError(
            400,
            'Unable to change sharing name. At least one question has been shared.',
          );
        }
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    res.redirect(req.originalUrl);
  }),
);

export default router;
