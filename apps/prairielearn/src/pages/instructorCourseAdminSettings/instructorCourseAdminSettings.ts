import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { CourseInfoCreateEditor, FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { updateCourseShowGettingStarted } from '../../models/course.js';

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );
    const availableTimezones = await getCanonicalTimezones([res.locals.course.display_timezone]);

    const courseGHLink = courseRepoContentUrl(res.locals.course);

    const origHash =
      (await getOriginalHash(path.join(res.locals.course.path, 'infoCourse.json'))) ?? '';

    const aiQuestionGenerationEnabled = await features.enabled('ai-question-generation', {
      course_id: res.locals.course.id,
      institution_id: res.locals.institution.id,
    });

    const aiQuestionGenerationCourseToggleEnabled = await features.enabled(
      'ai-question-generation-course-toggle',
      {
        course_id: res.locals.course.id,
        institution_id: res.locals.institution.id,
      },
    );

    res.send(
      InstructorCourseAdminSettings({
        resLocals: res.locals,
        aiQuestionGenerationEnabled,
        aiQuestionGenerationCourseToggleEnabled,
        coursePathExists,
        courseInfoExists,
        availableTimezones,
        origHash,
        courseGHLink,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (res.locals.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'update_configuration') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }

      const show_getting_started = req.body.show_getting_started === 'on';

      if (res.locals.course.show_getting_started !== show_getting_started) {
        await updateCourseShowGettingStarted({
          course_id: res.locals.course.id,
          show_getting_started,
        });
      }

      const context = {
        course_id: res.locals.course.id,
        institution_id: res.locals.institution.id,
      };

      if (await features.enabled('ai-question-generation-course-toggle', context)) {
        if (req.body.ai_question_generation) {
          await features.enable('ai-question-generation', context);
        } else {
          await features.disable('ai-question-generation', context);
        }
      }

      const paths = getPaths(undefined, res.locals);

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
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Course configuration updated successfully');
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_configuration') {
      const infoJson = {
        name: path.basename(res.locals.course.path),
        title: path.basename(res.locals.course.path),
        timezone: res.locals.institution.display_timezone,
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
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
