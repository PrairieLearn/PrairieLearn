//@ts-check
import * as express from 'express';
import * as path from 'path';
const asyncHandler = require('express-async-handler');
import * as fs from 'fs-extra';
const ERR = require('async-stacktrace');
import { CourseInfoEditor } from '../../lib/editors';
import { logger } from '@prairielearn/logger';
import * as error from '@prairielearn/error';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      await fs.access(res.locals.course.path);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.locals.needToSync = true;
      } else {
        throw new Error(err);
      }
    }

    try {
      await fs.access(path.join(res.locals.course.path, 'infoCourse.json'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.locals.noInfo = true;
      } else {
        throw new Error(err);
      }
    }

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

export default router;
