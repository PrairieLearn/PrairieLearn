import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as error from '@prairielearn/error';
import { InstructorSharing } from './instructorCourseAdminSharing.html.js';
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';
import { getCanonicalHost } from '../../lib/url.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const sharingInfo = await sqldb.queryRow(
      sql.get_course_sharing_info,
      {
        course_id: res.locals.course.id,
      },
      z.object({
        sharing_name: z.string().nullable(),
        sharing_token: z.string(),
      }),
    );

    const sharingSets = await sqldb.queryRows(
      sql.select_sharing_sets,
      { course_id: res.locals.course.id },
      z.object({
        name: z.string(),
        id: z.string(),
        shared_with: z.string().array(),
      }),
    );

    const host = getCanonicalHost(req);
    const publicSharingLink = new URL(
      `${res.locals.plainUrlPrefix}/public/course/${res.locals.course.id}/questions`,
      host,
    ).href;

    res.send(
      InstructorSharing({
        sharingName: sharingInfo.sharing_name,
        sharingToken: sharingInfo.sharing_token,
        sharingSets,
        publicSharingLink,
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
    } else if (req.body.__action === 'sharing_set_create') {
      await sqldb.queryZeroOrOneRowAsync(sql.sharing_set_create, {
        sharing_set_name: req.body.sharing_set_name.trim(),
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
        throw new error.HttpStatusError(400, 'Failed to Add Course to sharing set.');
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
        // First, check if any questions have been imported or shared publicly
        const checkResult = await sqldb.queryOptionalRow(
          sql.select_has_shared_question, 
          {
          course_id: res.locals.course.id,
          },
          z.any().nullable(),
        );

        if (!checkResult) {
          // If no questions have been imported or shared publicly, update the sharing name
          await sqldb.queryZeroOrOneRowAsync(
            sql.choose_sharing_name, 
            {
            sharing_name: req.body.course_sharing_name.trim(),
            course_id: res.locals.course.id,
            }
          );
        } else {
          // If any questions have been imported or shared publicly, do not update and return an error
          throw new error.HttpStatusError(
            400,
            'Unable to change sharing name. At least one question has been imported or shared publicly.',
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
