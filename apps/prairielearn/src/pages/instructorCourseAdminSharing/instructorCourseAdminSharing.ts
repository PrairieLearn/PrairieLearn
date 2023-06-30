import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import path = require('path');
import debugModule from 'debug';
import error = require('@prairielearn/error');
import { v4 as uuidv4 } from 'uuid';
import { InstructorSharing } from './instructorCourseAdminSharing.html';
import sqldb = require('@prairielearn/postgres');

const router = Router();
const debug = debugModule('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqldb.loadSqlEquiv(__filename);

async function generateSharingId(req, res) {
  const newSharingId = uuidv4();
  return await sqldb.queryZeroOrOneRowAsync(sql.update_sharing_token, {
    sharing_token: newSharingId,
    course_id: res.locals.course.id,
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    debug('GET /');

    let result = await sqldb.queryOneRowAsync(sql.get_course_sharing_info, {
      course_id: res.locals.course.id,
    });

    const sharing_name = result.rows[0].sharing_name;
    const sharing_token = result.rows[0].sharing_token;

    if (!sharing_token) {
      await generateSharingId(req, res);
      res.redirect(req.originalUrl);
      return;
    }

    result = await sqldb.queryAsync(sql.select_sharing_sets, { course_id: res.locals.course.id });
    res.send(
      InstructorSharing({
        sharing_name: sharing_name,
        sharing_token: sharing_token,
        sharing_sets: result.rows,
        resLocals: res.locals,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw error.make(403, 'Access denied (must be course owner)');
    }

    if (req.body.__action === 'sharing_token_regenerate') {
      await generateSharingId(req, res);
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
  })
);

export = router;
