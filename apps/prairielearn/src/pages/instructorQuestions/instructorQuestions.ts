import path from 'path';

import * as async from 'async';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();

/**
 * Get a list of template question qids and titles that can be used as starting points for new questions.
 */
async function getTemplateCourseQuestionOptions(): Promise<{ qid: string; title: string }[]> {
  let templateQuestions: { qid: string; title: string }[] = [];
  const templateQuestionsPath = path.join(EXAMPLE_COURSE_PATH, 'questions');

  const walk = async (relativeDir: string) => {
    const directories = await fs
      .readdir(path.join(templateQuestionsPath, relativeDir))
      .catch((err) => {
        // If the directory doesn't exist, then we have nothing to load
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
          return [] as string[];
        }
        throw err;
      });

    // For each subdirectory, try to find an Info file
    await async.each(directories, async (dir) => {
      // Relative path to the current folder
      const subdirPath = path.join(relativeDir, dir);

      // Absolute path to the info file
      const infoPath = path.join(templateQuestionsPath, subdirPath, 'info.json');

      // Check if the info file exists
      const hasInfoFile = await fs.pathExists(infoPath);
      if (hasInfoFile) {
        // Info file exists, we can use this directory
        const infoJson = await fs.readJson(infoPath);

        // Only use add the question if it has a title and topic equal to Template
        if (infoJson.title && infoJson.topic === 'Template') {
          templateQuestions.push({ qid: subdirPath, title: infoJson.title });
        }
      } else {
        // Info file doesn't exist, let's try recursing
        await walk(subdirPath);
      }
    });
  };

  await walk('template');

  templateQuestions = templateQuestions.sort((a, b) => a.title.localeCompare(b.title));

  return templateQuestions;
}

router.get(
  '/',
  asyncHandler(async function (req, res) {
    if (!res.locals.authz_data.has_course_permission_preview) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get view permissions.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          courseOwners,
          pageTitle: 'Questions',
          requiredPermissions: 'Previewer',
        }),
      );
      return;
    }

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const questions = await selectQuestionsForCourse(
      res.locals.course.id,
      courseInstances.map((ci) => ci.id),
    );

    const templateQuestions = await getTemplateCourseQuestionOptions();

    const courseDirExists = await fs.pathExists(res.locals.course.path);
    res.send(
      QuestionsPage({
        questions,
        templateQuestions,
        course_instances: courseInstances,
        showAddQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          courseDirExists,
        showAiGenerateQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          (await features.enabledFromLocals('ai-question-generation', res.locals)),
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_question') {
      if (!req.body.qid) {
        throw new error.HttpStatusError(400, 'qid is required');
      }
      if (!req.body.title) {
        throw new error.HttpStatusError(400, 'title is required');
      }
      if (!req.body.start_from) {
        throw new error.HttpStatusError(400, 'start_from is required');
      }
      if (req.body.start_from === 'Template' && !req.body.template_qid) {
        throw new error.HttpStatusError(400, 'template_qid is required');
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.qid)) {
        throw new error.HttpStatusError(
          400,
          `Invalid qid (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.qid}`,
        );
      }

      const api = getCourseFilesClient();

      const result = await api.createQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        qid: req.body.qid,
        title: req.body.title,
        template_qid: req.body.start_from === 'Template' ? req.body.template_qid : undefined,
      });

      if (result.status === 'error') {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + result.job_sequence_id);
        return;
      }

      flash('success', 'Question created successfully.');

      if (req.body.start_from === 'Template') {
        res.redirect(`${res.locals.urlPrefix}/question/${result.question_id}/settings`);
      } else {
        res.redirect(
          `${res.locals.urlPrefix}/question/${result.question_id}/file_view/questions/${result.question_qid}/question.html`,
        );
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
