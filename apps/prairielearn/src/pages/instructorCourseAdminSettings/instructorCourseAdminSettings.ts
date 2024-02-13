import * as express from 'express';
import * as path from 'path';
import asyncHandler = require('express-async-handler');
import * as fs from 'fs-extra';
import ERR = require('async-stacktrace');
import { CourseInfoEditor } from '../../lib/editors';
import { logger } from '@prairielearn/logger';
import * as error from '@prairielearn/error';

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );

    res.send(
      InstructorCourseAdminSettings({ resLocals: res.locals, coursePathExists, courseInfoExists }),
    );
  }),
);

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_edit || res.locals.course.example_course) {
    return next(
      error.make(403, 'Access denied (must be course editor and must not be example course)'),
    );
  }

  if (req.body.__action === 'add_configuration') {
    const editor = new CourseInfoEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(req.originalUrl);
        }
      });
    });
  } else {
    next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

export default router;
