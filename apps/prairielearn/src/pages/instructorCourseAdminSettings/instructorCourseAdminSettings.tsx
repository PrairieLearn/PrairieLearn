import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { CourseInfoCreateEditor, prepareJsonFileEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { computeStableHash } from '../../lib/json.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import {
  updateCourseQuestionsReceiveUserData,
  updateCourseShowGettingStarted,
} from '../../models/course.js';
import type { CourseJsonInput } from '../../schemas/infoCourse.js';

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

    const { authz_data } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseGHLink = courseRepoContentUrl(res.locals.course);

    const origHash = courseInfoExists
      ? computeStableHash(
          JSON.parse(
            await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
          ),
        )
      : '';

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
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course settings',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'settings',
        },
        headContent: compiledScriptTag('instructorCourseAdminSettingsClient.ts'),
        content: (
          <InstructorCourseAdminSettings
            aiQuestionGenerationEnabled={aiQuestionGenerationEnabled}
            aiQuestionGenerationCourseToggleEnabled={aiQuestionGenerationCourseToggleEnabled}
            authzData={authz_data}
            availableTimezones={availableTimezones}
            course={res.locals.course}
            courseGHLink={courseGHLink}
            courseInfoExists={courseInfoExists}
            coursePathExists={coursePathExists}
            csrfToken={res.locals.__csrf_token}
            institution={res.locals.institution}
            origHash={origHash}
            urlPrefix={res.locals.urlPrefix}
          />
        ),
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

      const questions_receive_user_data = req.body.questions_receive_user_data === 'on';
      const questions_receive_user_data_changed =
        res.locals.course.questions_receive_user_data !== questions_receive_user_data;

      if (questions_receive_user_data_changed) {
        if (!res.locals.authz_data.has_course_permission_own) {
          throw new error.HttpStatusError(
            403,
            'Only course owners can change whether questions receive user data',
          );
        }
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

      const preparedEditor = await prepareJsonFileEditor<CourseJsonInput>({
        jsonPath: path.join(res.locals.course.path, 'infoCourse.json'),
        conflictCheck: { origHash: req.body.orig_hash, scope: (courseInfo) => courseInfo },
        applyChanges: (courseInfo) => {
          courseInfo.name = req.body.short_name;
          courseInfo.title = req.body.title;
          courseInfo.timezone = req.body.display_timezone;

          // Only persist settings to JSON when in development mode.
          if (questions_receive_user_data) {
            courseInfo.options = { ...courseInfo.options, questionsReceiveUserData: true };
          } else {
            delete courseInfo.options?.questionsReceiveUserData;
          }

          return courseInfo;
        },
        locals: {
          authz_data: res.locals.authz_data,
          course: res.locals.course,
          user: res.locals.user,
        },
        container: { rootPath: paths.rootPath, invalidRootPaths: paths.invalidRootPaths },
      });

      if (!preparedEditor.success) {
        flash(
          'error',
          'Course configuration was modified elsewhere. Please reload the page and try again.',
        );
        return res.redirect(req.originalUrl);
      }

      // In production, sync treats the database as the source of truth for this
      // setting and warns if infoCourse.json disagrees. Update the DB before
      // executing the file edit so the sync triggered by the edit sees the new
      // value. Risk: if the later file edit fails, the DB setting has still
      // changed and the JSON mirror may be stale until the next successful save.
      if (questions_receive_user_data_changed && !config.devMode) {
        await updateCourseQuestionsReceiveUserData({
          course_id: res.locals.course.id,
          questions_receive_user_data,
          authn_user_id: res.locals.authn_user.id,
          user_id: res.locals.user.id,
          old_questions_receive_user_data: res.locals.course.questions_receive_user_data,
        });
      }

      const serverJob = await preparedEditor.editor.prepareServerJob();
      try {
        await preparedEditor.editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      if (questions_receive_user_data_changed && config.devMode) {
        await updateCourseQuestionsReceiveUserData({
          course_id: res.locals.course.id,
          questions_receive_user_data,
          authn_user_id: res.locals.authn_user.id,
          user_id: res.locals.user.id,
          old_questions_receive_user_data: res.locals.course.questions_receive_user_data,
        });
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
