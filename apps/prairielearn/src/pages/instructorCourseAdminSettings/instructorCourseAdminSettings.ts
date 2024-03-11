import * as express from 'express';
import * as path from 'path';
import asyncHandler = require('express-async-handler');
import * as fs from 'fs-extra';
import { CourseInfoEditor } from '../../lib/editors';
import * as error from '@prairielearn/error';
import { v4 as uuidv4 } from 'uuid';

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html';
import { getAvailableTimezones } from '../../lib/timezones';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );
    const availableTimezones = await getAvailableTimezones();

    res.send(
      InstructorCourseAdminSettings({
        resLocals: res.locals,
        coursePathExists,
        courseInfoExists,
        availableTimezones,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_edit || res.locals.course.example_course) {
      return next(
        error.make(403, 'Access denied (must be course editor and must not be example course)'),
      );
    }

    if (req.body.__action === 'update_configuration') {
      const courseInfo = JSON.parse(
        await fs.readFileSync(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );
      courseInfo.name = req.body.short_name;
      courseInfo.title = req.body.title;
      courseInfo.timezone = req.body.display_timezone;

      const editor = new CourseInfoEditor({
        locals: res.locals,
        infoJson: courseInfo,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        return res.redirect(req.originalUrl);
      } catch (err) {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    }

    if (req.body.__action === 'add_configuration') {
      const infoJson = {
        uuid: uuidv4(),
        name: path.basename(res.locals.course.path),
        title: path.basename(res.locals.course.path),
        options: {
          useNewQuestionRenderer: true,
        },
        tags: [],
        topics: [],
      };

      const editor = new CourseInfoEditor({
        locals: res.locals,
        infoJson,
        flag: 'wx',
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        return res.redirect(req.originalUrl);
      } catch (err) {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  }),
);

export default router;
