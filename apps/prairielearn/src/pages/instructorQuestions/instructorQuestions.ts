import * as url from 'node:url';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { getSearchParams } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../models/question.js';
import { type QuestionsPageData, selectQuestionsForCourse } from '../../models/questions.js';
import { loadQuestions } from '../../sync/course-db.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();

let cachedTemplateQuestionExampleCourse: { qid: string; title: string }[] | null = null;

/**
 * Get a list of template question from the example course. While it should
 * typically be possible to retrieve these from the database, these are
 * retrieved from the filesystem for the following reasons:
 * 1. There is no guarantee that the example course will actually be synced in
 *    the current environment. The local installation (dev or prod) may have
 *    removed it from the sync process.
 * 2. The synced example course may not be up-to-date with the source example
 *    course questions, and we want to use the latest version.
 * 3. The current method of identifying an example course is based on
 *    information that may be forgeable by setting specific values in the course
 *    info file, which could lead to a security vulnerability if we were to rely
 *    on the database.
 */
async function getTemplateQuestionsExampleCourse() {
  if (!config.devMode) {
    if (cachedTemplateQuestionExampleCourse) {
      return cachedTemplateQuestionExampleCourse;
    }
  }

  const questions = await loadQuestions({
    coursePath: EXAMPLE_COURSE_PATH,
    // We don't actually care about sharing settings here, but we do use shared
    // questions in the example course, so we'll flag sharing as enabled.
    sharingEnabled: true,
  });

  const templateQuestions = Object.entries(questions)
    .map(([qid, question]) => ({ qid, title: question.data?.title }))
    .filter(({ qid, title }) => qid.startsWith('template/') && title !== undefined) as {
    qid: string;
    title: string;
  }[];

  const sortedTemplateQuestionOptions = templateQuestions.sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  if (!config.devMode) {
    cachedTemplateQuestionExampleCourse = sortedTemplateQuestionOptions;
  }

  return sortedTemplateQuestionOptions;
}

/**
 * Get a list of template question qids and titles that can be used as starting
 * points for new questions, both from the example course and course-specific
 * templates.
 */
async function getTemplateQuestions(questions: QuestionsPageData[]) {
  const exampleCourseTemplateQuestions = await getTemplateQuestionsExampleCourse();
  const courseTemplateQuestions = questions
    .filter(({ qid }) => qid.startsWith('template/'))
    .map(({ qid, title }) => ({ example_course: false, qid, title }));
  return [
    ...exampleCourseTemplateQuestions.map((q) => ({ example_course: true, ...q })),
    ...courseTemplateQuestions,
  ];
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async function (req, res) {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (!authzData.has_course_permission_preview) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get view permissions.
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'course_admin',
            subPage: 'questions',
          },
          courseOwners,
          pageTitle: 'Questions',
          requiredPermissions: 'Previewer',
        }),
      );
      return;
    }

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Previewer'],
    });

    const questions = await selectQuestionsForCourse(
      course.id,
      courseInstances.map((ci) => ci.id),
    );

    const templateQuestions = await getTemplateQuestions(questions);

    const courseDirExists = await fs.pathExists(course.path);
    res.send(
      QuestionsPage({
        questions,
        templateQuestions,
        course_instances: courseInstances,
        showAddQuestionButton:
          authzData.has_course_permission_edit && !course.example_course && courseDirExists,
        showAiGenerateQuestionButton:
          authzData.has_course_permission_edit &&
          !course.example_course &&
          isEnterprise() &&
          (await features.enabledFromLocals('ai-question-generation', authzData)),
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
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'passthrough',
  }),
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
          navContext: {
            type: 'instructor',
            page: 'course_admin',
            subPage: 'questions',
          },
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
        template_source: req.body.start_from,
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
