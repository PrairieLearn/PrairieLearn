import { pipeline } from 'node:stream/promises';

import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { MAX_PRINT_COPIES } from '../../lib/client/print-packet.js';
import { StaffAssessmentInstanceSchema } from '../../lib/client/safe-db-types.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getPrintExportStream, selectPrintExportJob } from '../../lib/print-export-jobs.js';
import { assessmentHasPrintRandomization } from '../../lib/print-preparation.js';
import { isBrowserRenderingAvailable } from '../../lib/printing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';
import { countJoinedStudentsInCourseInstance } from '../../models/enrollment.js';

import { InstructorAssessmentPrint } from './instructorAssessmentPrint.html.js';

const router = Router();

router.get(
  '/exports/:jobSequenceId.pdf',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const job = await selectPrintExportJob({
      jobSequenceId: IdSchema.parse(req.params.jobSequenceId),
      assessmentId: res.locals.assessment.id,
      authnUserId: res.locals.authn_user.id,
    });
    if (!job?.result) throw new HttpStatusError(404, 'PDF not found or no longer available');
    if (
      job.result.document !== 'exam' &&
      !res.locals.authz_data.has_course_instance_permission_edit
    ) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    const stream = await getPrintExportStream(job.result.key);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/pdf');
    res.attachment(job.result.filename);
    await pipeline(stream, res);
  }),
);

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
    const instances = StaffAssessmentInstanceSchema.array().parse(
      await selectAssessmentInstancesForUser({
        assessment_id: assessment.id,
        user_id: authz_data.user.id,
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
        url: `/pl/course_instance/${course_instance.id}/instructor/assessment_instance/`,
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
              instances={instances}
              defaultCopies={Math.min(MAX_PRINT_COPIES, Math.max(1, studentCount))}
              renderingAvailable={isBrowserRenderingAvailable()}
              canEditStudentData={authz_data.has_course_instance_permission_edit}
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
