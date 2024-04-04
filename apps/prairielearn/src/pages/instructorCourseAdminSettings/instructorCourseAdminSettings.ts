import * as express from 'express';
import * as path from 'path';
import asyncHandler = require('express-async-handler');
import * as fs from 'fs-extra';
import { CourseInfoCreateEditor, FileModifyEditor } from '../../lib/editors';
import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import sha256 = require('crypto-js/sha256');
import { v4 as uuidv4 } from 'uuid';

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html';
import { getAvailableTimezones } from '../../lib/timezones';
import { getPaths } from '../../lib/instructorFiles';
import { b64EncodeUnicode } from '../../lib/base64-util';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );
    const availableTimezones = await getAvailableTimezones();

    let origHash = '';
    if (courseInfoExists) {
      origHash = sha256(
        b64EncodeUnicode(
          await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
        ),
      ).toString();
    }

    res.send(
      InstructorCourseAdminSettings({
        resLocals: res.locals,
        coursePathExists,
        courseInfoExists,
        availableTimezones,
        origHash,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw error.make(403, 'Access denied. Must be course editor to make changes.');
    }

    if (res.locals.course.example_course) {
      throw error.make(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'update_configuration') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw error.make(400, 'infoCourse.json does not exist');
      }
      const paths = getPaths(req, res);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );

      const origHash = req.body.orig_hash;

      const courseInfoEdit = courseInfo;
      courseInfoEdit.name = req.body.short_name;
      courseInfoEdit.title = req.body.title;
      courseInfoEdit.timezone = req.body.display_timezone;

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(res.locals.course.path, 'infoCourse.json'),
        editContents: b64EncodeUnicode(JSON.stringify(courseInfoEdit, null, 2)),
        origHash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        flash('success', 'Course configuration updated successfully');
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
        timezone: res.locals.institution.display_timezone,
        options: {
          useNewQuestionRenderer: true,
        },
        tags: [],
        topics: [],
      };
      const editor = new CourseInfoCreateEditor({
        locals: res.locals,
        infoJson,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        return res.redirect(req.originalUrl);
      } catch (err) {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
