import * as express from 'express';
import * as path from 'path';
import asyncHandler = require('express-async-handler');
import * as fs from 'fs-extra';
import { CourseInfoEditor, FileModifyEditor } from '../../lib/editors';
import * as error from '@prairielearn/error';
import { v4 as uuidv4 } from 'uuid';
import { flash } from '@prairielearn/flash';
import sha256 = require('crypto-js/sha256');

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html';
import { getAvailableTimezones } from '../../lib/timezones';
import { b64EncodeUnicode } from '../../lib/base64-util';
import { getPaths } from '../../lib/instructorFiles';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );

    let origHash = '';
    if (courseInfoExists) {
      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );
      console.log('courseInfo', courseInfo);
      const courseInfoContents = JSON.stringify(courseInfo, null, 2);
      console.log('courseInfoContents', courseInfoContents);
      const b64courseInfoContents = b64EncodeUnicode(courseInfoContents);
      console.log('b64courseInfoContents', b64courseInfoContents);
      origHash = sha256(b64courseInfoContents).toString();
      console.log('origHash', origHash);
    }
    const availableTimezones = await getAvailableTimezones();

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
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_permission_edit || res.locals.course.example_course) {
      return next(
        error.make(403, 'Access denied (must be course editor and must not be example course)'),
      );
    }

    if (req.body.__action === 'update_configuration') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw error.make(400, 'infoCourse.json does not exist');
      }
      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );
      courseInfo.name = req.body.short_name;
      courseInfo.title = req.body.title;
      courseInfo.timezone = req.body.display_timezone;

      const paths = getPaths(req, res);

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(paths.workingPath, 'infoCourse.json'),
        editContents: courseInfo,
        origHash: req.body.orig_hash,
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
      console.log(res.locals.institution);
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
