import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { MAX_PRINT_COPIES } from '../../lib/client/printing/print-packet.js';
import { StaffPrintFormSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { isBrowserRenderingAvailable } from '../../lib/printing/index.js';
import { assessmentHasPrintRandomization } from '../../lib/printing/print-preparation.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { requirePrintableAssessments } from '../../middlewares/requirePrintableAssessments.js';
import { countJoinedStudentsInCourseInstance } from '../../models/enrollment.js';
import { selectPrintFormsForUser } from '../../models/print-form.js';

import { InstructorAssessmentPrint } from './instructorAssessmentPrint.html.js';

const router = Router();

router.use(requirePrintableAssessments);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { assessment, course_instance, authz_data, authn_user } = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });
    const forms = StaffPrintFormSchema.array().parse(
      await selectPrintFormsForUser({
        assessmentId: assessment.id,
        userId: authz_data.user.id,
      }),
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
        headContent: [compiledStylesheetTag('instructor-assessment-print.css')],
        options: { fullWidth: true, contentContainerClassName: 'print-preparation-container' },
        content: (
          <Hydrate className="print-preparation-root">
            <InstructorAssessmentPrint
              assessmentId={assessment.id}
              courseInstanceId={course_instance.id}
              hasRandomization={await assessmentHasPrintRandomization(assessment.id)}
              groupWork={assessment.team_work}
              requireHonorCode={!!assessment.require_honor_code}
              forms={forms}
              enrolledStudents={studentCount}
              defaultCopies={Math.min(MAX_PRINT_COPIES, Math.max(1, studentCount))}
              renderingAvailable={isBrowserRenderingAvailable()}
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
