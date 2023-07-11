import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { v4 as uuidv4 } from 'uuid';
import { CourseSchema } from '../../lib/db-types';
import { InstructorSharing } from './instructorCourseAdminSharing.html';
import sqldb = require('@prairielearn/postgres');

const router = Router();
const sql = sqldb.loadSqlEquiv(__filename);

async function generateSharingId(res) {
  const newSharingId = uuidv4();
  return await sqldb.queryZeroOrOneRowAsync(sql.update_sharing_token, {
    sharing_token: newSharingId,
    course_id: res.locals.course.id,
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.question_sharing_enabled) {
      throw error.make(403, 'Access denied (feature not available)');
    }

    const sharingInfo = await sqldb.queryRow(
      sql.get_course_sharing_info,
      {
        course_id: res.locals.course.id,
      },
      CourseSchema,
    );

    if (!sharingInfo.sharing_token) {
      await generateSharingId(res);
      res.redirect(req.originalUrl);
      return;
    }

    const sharingSets = await sqldb.queryAsync(sql.select_sharing_sets, {
      course_id: res.locals.course.id,
    });
    res.send(
      InstructorSharing({
        sharing_name: sharingInfo.sharing_name,
        sharing_token: sharingInfo.sharing_token,
        sharing_sets: sharingSets.rows,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }
    if (!res.locals.question_sharing_enabled) {
      throw error.make(403, 'Access denied (feature not available)');
    }

    if (req.body.__action === 'sharing_token_regenerate') {
      await generateSharingId(res);
      res.redirect(req.originalUrl);
      return;
    } else if (req.body.__action === 'unsafe_sharing_set_create') {
      await sqldb.queryZeroOrOneRowAsync(sql.sharing_set_create, {
        sharing_set_name: req.body.sharing_set_name,
        course_id: res.locals.course.id,
      });
    } else if (req.body.__action === 'unsafe_course_sharing_set_add') {
      await sqldb.queryZeroOrOneRowAsync(sql.course_sharing_set_add, {
        sharing_set_id: req.body.sharing_set_id,
        course_sharing_token: req.body.course_sharing_token,
      });
    } else if (req.body.__action === 'unsafe_choose_sharing_name') {
      if (
        req.body.course_sharing_name.includes('/') ||
        req.body.course_sharing_name.includes('@')
      ) {
        throw error.make(400, 'Course Sharing Name is not allowed to contain "/" or "@".');
      }
      await sqldb.queryZeroOrOneRowAsync(sql.choose_sharing_name, {
        sharing_name: req.body.course_sharing_name,
        course_id: res.locals.course.id,
      });
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
    res.redirect(req.originalUrl);
  }),
);

export = router;
