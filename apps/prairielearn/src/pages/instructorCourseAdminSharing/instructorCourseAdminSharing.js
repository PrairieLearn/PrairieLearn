// @ts-check
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');
const { v4: uuidv4 } = require('uuid');
const { InstructorSharing } = require('./instructorCourseAdminSharing.html');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

async function generateSharingId(req, res) {
  let newSharingId = uuidv4();
  return await sqldb.queryZeroOrOneRowAsync(sql.update_sharing_id, {
    sharing_id: newSharingId,
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

    let sharing_name = result.rows[0].sharing_name;
    let sharing_id = result.rows[0].sharing_id;

    if (!sharing_id) {
      await generateSharingId(req, res);
      res.redirect(req.originalUrl);
      return;
    }

    result = await sqldb.queryAsync(sql.select_sharing_sets, { course_id: res.locals.course.id });
    res.send(
      InstructorSharing({
        sharing_name: sharing_name,
        sharing_id: sharing_id,
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

    if (req.body.__action === 'sharing_id_regenerate') {
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
        course_sharing_id: req.body.course_sharing_id,
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

module.exports = router;
