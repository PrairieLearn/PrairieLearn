import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAssessmentInstanceSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { isBrowserRenderingAvailable } from '../../lib/printing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';

import { InstructorAssessmentPrint } from './instructorAssessmentPrint.html.js';

const router = Router();

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
    if (assessment.type !== 'Exam') {
      throw new HttpStatusError(400, 'Only exams can be printed.');
    }
    const instances = StaffAssessmentInstanceSchema.array().parse(
      await selectAssessmentInstancesForUser({
        assessment_id: assessment.id,
        user_id: authz_data.user.id,
      }),
    );
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

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Print preparation',
        navContext: { type: 'instructor', page: 'assessment', subPage: 'print_preparation' },
        headContent: [compiledStylesheetTag('instructorAssessmentPrint.css')],
        options: { fullWidth: true, contentContainerClassName: 'print-preparation-container' },
        content: (
          <Hydrate className="print-preparation-root">
            <InstructorAssessmentPrint
              assessmentId={assessment.id}
              courseInstanceId={course_instance.id}
              multipleInstance={assessment.multiple_instance}
              groupWork={assessment.team_work}
              instances={instances}
              timezone={course_instance.display_timezone}
              renderingAvailable={isBrowserRenderingAvailable()}
              trpcCsrfToken={trpcCsrfToken}
              search={getUrl(req).search}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
