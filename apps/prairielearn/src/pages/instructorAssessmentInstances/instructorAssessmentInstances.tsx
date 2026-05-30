import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectAssessmentInstancesForTable } from '../../trpc/assessment/assessment-instances.js';

import { InstructorAssessmentInstances } from './instructorAssessmentInstances.html.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  asyncHandler(async (req, res) => {
    const { assessment, assessment_set, course_instance, authn_user, authz_data } =
      extractPageContext(res.locals, { pageType: 'assessment', accessType: 'instructor' });

    const initialRows = await selectAssessmentInstancesForTable({
      assessment_id: assessment.id,
      timezone: course_instance.display_timezone,
    });

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
        pageTitle: 'Instances',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'instances',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <InstructorAssessmentInstances
              initialRows={initialRows}
              assessment={assessment}
              assessmentSet={assessment_set}
              courseInstance={course_instance}
              canEdit={authz_data.has_course_instance_permission_edit}
              trpcCsrfToken={trpcCsrfToken}
              search={getUrl(req).search}
              isDevMode={config.devMode}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
