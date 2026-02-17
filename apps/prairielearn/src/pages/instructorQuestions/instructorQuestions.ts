import * as url from 'node:url';

import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseOwners } from '../../lib/course.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getSearchParams } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'passthrough',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async function (req, res) {
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

    const courseDirExists = await fs.pathExists(course.path);
    res.send(
      QuestionsPage({
        questions,
        course_instances: courseInstances,
        showAddQuestionButton:
          authzData.has_course_permission_edit && !course.example_course && courseDirExists,
        showAiGenerateQuestionButton:
          authzData.has_course_permission_edit &&
          !course.example_course &&
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
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'passthrough',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
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

export default router;
