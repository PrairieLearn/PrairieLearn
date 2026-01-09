import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await selectAssessmentQuestions({
      assessment_id: res.locals.assessment.id,
    });

    const pageContext = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

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
        content: (
          <Hydrate>
            <InstructorAssessmentQuestionsTable
              course={pageContext.course}
              questionRows={questionRows}
              urlPrefix={pageContext.urlPrefix}
              assessmentType={pageContext.assessment.type}
              assessmentSetName={pageContext.assessment_set.name}
              assessmentNumber={pageContext.assessment.number}
              hasCoursePermissionPreview={pageContext.authz_data.has_course_permission_preview}
              hasCourseInstancePermissionEdit={
                // TODO: This should never be undefined on this page. Ideally we fix
                // this up in the `extractPageContext` function types.
                pageContext.authz_data.has_course_instance_permission_edit ?? false
              }
              csrfToken={res.locals.__csrf_token}
            />
          </Hydrate>
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
        authn_user_id: res.locals.authn_user.id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
