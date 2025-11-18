import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { renderHtml } from '@prairielearn/preact';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  getAssessmentContext,
  getCourseInstanceContext,
  getPageContext,
} from '../../lib/client/page-context.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await selectAssessmentQuestions({
      assessment_id: res.locals.assessment.id,
    });

    const { authz_data, urlPrefix } = getPageContext(res.locals);
    const { course_instance, course } = getCourseInstanceContext(res.locals, 'instructor');
    const { assessment, assessment_set } = getAssessmentContext(res.locals);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Questions',
        headContent: compiledScriptTag('instructorAssessmentQuestionsClient.ts'),
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'questions',
        },
        options: {
          fullWidth: true,
        },
        content: renderHtml(
          <>
            <AssessmentSyncErrorsAndWarnings
              authzData={authz_data}
              assessment={assessment}
              courseInstance={course_instance}
              course={course}
              urlPrefix={urlPrefix}
            />
            <Hydrate>
              <InstructorAssessmentQuestionsTable
                course={course}
                questionRows={questionRows}
                urlPrefix={urlPrefix}
                assessmentType={assessment.type}
                assessmentSetName={assessment_set.name}
                assessmentNumber={assessment.number}
                hasCoursePermissionPreview={res.locals.authz_data.has_course_permission_preview}
                hasCourseInstancePermissionEdit={
                  res.locals.authz_data.has_course_instance_permission_edit
                }
                csrfToken={res.locals.__csrf_token}
              />
            </Hydrate>
          </>,
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      if (res.locals.assessment.type === 'Exam') {
        // See https://github.com/PrairieLearn/PrairieLearn/issues/12977
        throw new HttpStatusError(403, 'Cannot reset variants for Exam assessments');
      }

      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
