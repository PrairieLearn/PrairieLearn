import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import { getTemplateQuestions } from '../instructorQuestions/templateQuestions.js';

import { CreateQuestionForm } from './components/CreateQuestionForm.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async function (req, res) {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (course.example_course || !(await fs.pathExists(course.path))) {
      throw new error.HttpStatusError(403, 'Cannot create questions in this course.');
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

    const { exampleCourseZones, courseTemplates } = await getTemplateQuestions(questions);
    const trpcUrl = getCourseTrpcUrl(course.id);
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Create question',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'questions',
        },
        options: {
          contentPadding: false,
          contentContainerClassName: 'bg-light',
        },
        content: (
          <Hydrate>
            <CreateQuestionForm
              exampleCourseZones={exampleCourseZones}
              courseTemplates={courseTemplates}
              trpcCsrfToken={trpcCsrfToken}
              courseId={course.id}
              questionsUrl={`${res.locals.urlPrefix}/course_admin/questions`}
              editErrorUrlPrefix={`${res.locals.urlPrefix}/edit_error`}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
