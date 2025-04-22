import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { CourseInfoCreateEditor, FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { updateCourseShowGettingStarted } from '../../models/course.js';

import { InstructorCourseAdminSettings } from './instructorCourseAdminSettings.html.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import { ensureVariant } from '../../lib/question-variant.js';
import _ from 'lodash';
import { getAndRenderVariant } from '../../lib/question-render.js';
import { selectQuestionById } from '../../models/question.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const coursePathExists = await fs.pathExists(res.locals.course.path);
    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );
    const availableTimezones = await getCanonicalTimezones([res.locals.course.display_timezone]);

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
        locals: res.locals as any,
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
        locals: res.locals as any,
        infoJson,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        return res.redirect(req.originalUrl);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'test_all_questions') {
      const serverJob = await createServerJob({
        courseId: res.locals.course.id,
        userId: res.locals.user.user_id,
        authnUserId: res.locals.authn_user.user_id,
        type: 'test_all_questions',
        description: 'Test all questions with legacy and experimental renderer',
      });

      serverJob.executeInBackground(async (job) => {
        const questions = await selectQuestionsForCourse(res.locals.course.id, []);

        for (const { id: question_id } of questions) {
          const question = await selectQuestionById(question_id);

          if (question.type !== 'Freeform') {
            job.verbose(`Skipping question ${question.id} (${question.type})`);
            continue;
          }

          res.locals.course.options ??= {};

          res.locals.course.options.rendererOverride = 'legacy';
          const legacyVariant = await ensureVariant(
            question.id,
            null,
            res.locals.user.user_id,
            res.locals.authn_user.user_id,
            null,
            res.locals.course,
            res.locals.course,
            { variant_seed: '16k1uyu' },
            false,
            null,
          );

          res.locals.course.options.rendererOverride = 'experimental';
          const newVariant = await ensureVariant(
            question.id,
            null,
            res.locals.user.user_id,
            res.locals.authn_user.user_id,
            null,
            res.locals.course,
            res.locals.course,
            { variant_seed: '16k1uyu' },
            false,
            null,
          );

          const sameParams = _.isEqual(legacyVariant.params, newVariant.params);
          const sameTrueAnswer = _.isEqual(legacyVariant.true_answer, newVariant.true_answer);
          const sameBroken = _.isEqual(legacyVariant.broken, newVariant.broken);

          if (!sameParams) {
            job.error(
              `Question ${question.qid} has different variant params for legacy and experimental renderers`,
            );
            job.error('Legacy params:       ' + JSON.stringify(legacyVariant.params));
            job.error('Experimental params: ' + JSON.stringify(newVariant.params));
          }

          if (!sameTrueAnswer) {
            job.error(
              `Question ${question.qid} has different true_answer for legacy and experimental renderers`,
            );
            job.error('Legacy true_answer:       ' + JSON.stringify(legacyVariant.true_answer));
            job.error('Experimental true_answer: ' + JSON.stringify(newVariant.true_answer));
          }

          if (!sameBroken) {
            job.error(
              `Question ${question.qid} has different broken status for legacy and experimental renderers`,
            );
            job.error('Legacy broken:       ' + JSON.stringify(legacyVariant.broken));
            job.error('Experimental broken: ' + JSON.stringify(newVariant.broken));
          }

          if (sameParams && sameTrueAnswer && sameBroken) {
            job.info(`Question ${question.qid} matches across legacy and experimental renderers`);
          } else {
            job.info(
              `Mismatch between legacy variant (${legacyVariant.id}) and experimental variant (${newVariant.id})`,
            );
          }

          res.locals.course.options.rendererOverride = 'experimental';
          await getAndRenderVariant(
            newVariant.id,
            null,
            {
              course: res.locals.course,
              urlPrefix: res.locals.urlPrefix,
              user: res.locals.user,
              authn_user: res.locals.authn_user,
              question,
              // This doesn't matter.
              is_administrator: false,
            },
            {
              rendererOverride: 'experimental',
            },
          );
          const newQuestionHtml = res.locals.questionHtml;

          res.locals.course.options.rendererOverride = 'legacy';
          await getAndRenderVariant(
            legacyVariant.id,
            null,
            {
              course: res.locals.course,
              urlPrefix: res.locals.urlPrefix,
              user: res.locals.user,
              authn_user: res.locals.authn_user,
              question,
              // This doesn't matter.
              is_administrator: false,
            },
            {
              rendererOverride: 'legacy',
            },
          );
          const legacyQuestionHtml = res.locals.questionHtml;

          if (newQuestionHtml !== legacyQuestionHtml) {
            job.error(
              `Question ${question.id} has different HTML for legacy and experimental renderers`,
            );
            job.error('Legacy HTML:');
            job.error(newQuestionHtml);
            job.error('Experimental HTML:');
            job.error(legacyQuestionHtml);
          }
        }
      });

      return res.redirect(res.locals.urlPrefix + '/jobSequence/' + serverJob.jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
