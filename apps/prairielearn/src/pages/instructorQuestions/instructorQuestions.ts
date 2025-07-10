import * as url from 'node:url';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import { getSearchParams } from '../../lib/url.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();

const sql = loadSqlEquiv(import.meta.url);

/**
 * Get a list of template question qids and titles that can be used as starting points for new questions.
 */
async function getTemplateCourseQuestionOptions(course_id: string) {
  return await queryRows(
    sql.select_template_questions,
    { course_id },
    z.object({ example_course: z.boolean(), qid: z.string(), title: z.string() }),
  );
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

    const templateQuestions = await getTemplateCourseQuestionOptions(res.locals.course.id);

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
          isEnterprise() &&
          (await features.enabledFromLocals('ai-question-generation', res.locals)),
        resLocals: res.locals,
      }),
    );
  }),
);

// This route will redirect to a question preview based on the QID.
// This is meant to support automated testing of questions when one might not
// want to jump through hoops to get a question ID from a QID.
router.get(
  '/qid/*',
  asyncHandler(async (req, res) => {
    // Access control may not matter as much here, since we'll still deny
    // access after the redirect, but doing this will allow us to avoid
    // leaking the existence or non-existence of questions to viewers,
    // which can't hurt.
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

    const question = await selectOptionalQuestionByQid({
      qid: req.params[0],
      course_id: res.locals.course.id,
    });

    if (!question) {
      throw new error.HttpStatusError(404, 'Question not found');
    }

    // Forward all query parameters except `qid`. Specifically, we want to support
    // `variant_seed` for previewing questions with a specific seed.
    const searchParams = getSearchParams(req);
    searchParams.delete('qid');

    res.redirect(
      url.format({
        pathname: `${res.locals.urlPrefix}/question/${question.id}/preview`,
        search: searchParams.toString(),
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
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.qid)) {
        throw new error.HttpStatusError(
          400,
          `Invalid qid (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.qid}`,
        );
      }
      const usesTemplate = ['example', 'course'].includes(req.body.start_from);
      if (usesTemplate && !req.body.template_qid) {
        throw new error.HttpStatusError(400, 'template_qid is required');
      }

      const api = getCourseFilesClient();

      const result = await api.createQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        qid: req.body.qid,
        title: req.body.title,
        template_start_from: req.body.start_from,
        template_qid: usesTemplate ? req.body.template_qid : undefined,
      });

      if (result.status === 'error') {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + result.job_sequence_id);
        return;
      }

      flash('success', 'Question created successfully.');

      if (usesTemplate) {
        res.redirect(`${res.locals.urlPrefix}/question/${result.question_id}/preview`);
      } else {
        res.redirect(
          `${res.locals.urlPrefix}/question/${result.question_id}/file_edit/questions/${result.question_qid}/question.html`,
        );
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
