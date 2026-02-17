import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { validateShortName } from '../../lib/short-name.js';
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
              csrfToken={res.locals.__csrf_token}
              questionsUrl={`${res.locals.urlPrefix}/course_admin/questions`}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    if (req.body.__action === 'add_question') {
      if (res.locals.course.example_course) {
        throw new error.HttpStatusError(
          403,
          'Access denied. Cannot make changes to example course.',
        );
      }
      if (!req.body.qid) {
        throw new error.HttpStatusError(400, 'QID is required');
      }
      if (!req.body.title) {
        throw new error.HttpStatusError(400, 'title is required');
      }
      if (!req.body.start_from) {
        throw new error.HttpStatusError(400, 'start_from is required');
      }
      const shortNameValidation = validateShortName(req.body.qid);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(
          400,
          `Invalid QID: ${shortNameValidation.lowercaseMessage}`,
        );
      }
      const usesTemplate = ['example', 'course'].includes(req.body.start_from);
      if (usesTemplate && !req.body.template_qid) {
        throw new error.HttpStatusError(400, 'template_qid is required');
      }

      const api = getCourseFilesClient();

      const result = await api.createQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
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
