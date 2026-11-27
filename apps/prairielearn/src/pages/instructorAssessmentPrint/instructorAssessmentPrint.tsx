import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffPrintPreparationFormSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  assessmentHasPrintRandomization,
  selectPrintPreparationForms,
} from '../../lib/printing/print-preparation.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { requirePrintingAvailable } from '../../middlewares/requirePrintingAvailable.js';
import { countJoinedStudentsInCourseInstance } from '../../models/enrollment.js';

import { InstructorAssessmentPrint } from './instructorAssessmentPrint.html.js';

const router = Router();

router.use(requirePrintingAvailable);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { assessment, course_instance, authn_user, authz_data } = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });
    const forms = StaffPrintPreparationFormSchema.array().parse(
      await selectPrintPreparationForms(assessment.id),
    );
    const studentCount = await countJoinedStudentsInCourseInstance(course_instance);
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({
          courseInstanceId: course_instance.id,
          assessmentId: assessment.id,
        }),
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );
    const docxCsrfToken = generatePrefixCsrfToken(
      {
        url: `/pl/course_instance/${course_instance.id}/instructor/assessment/${assessment.id}/print_form/`,
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Print',
        navContext: { type: 'instructor', page: 'assessment', subPage: 'questions' },
        headContent: [compiledStylesheetTag('instructorAssessmentPrint.css')],
        options: { fullWidth: true, contentContainerClassName: 'print-preparation-container' },
        content: (
          <Hydrate className="print-preparation-root">
            <InstructorAssessmentPrint
              assessmentId={assessment.id}
              courseInstanceId={course_instance.id}
              hasRandomization={await assessmentHasPrintRandomization(assessment.id)}
              groupWork={assessment.team_work}
              canEditPrintForms={authz_data.has_course_permission_edit}
              requireHonorCode={!!assessment.require_honor_code}
              displayTimezone={course_instance.display_timezone}
              forms={forms}
              enrolledStudents={studentCount}
              trpcCsrfToken={trpcCsrfToken}
              docxCsrfToken={docxCsrfToken}
              search={getUrl(req).search}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
