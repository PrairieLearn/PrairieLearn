import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
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
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const initialRows = await selectAssessmentInstancesForTable({
      assessment_id: res.locals.assessment.id,
      timezone: res.locals.course_instance.display_timezone,
    });

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({
          courseInstanceId: res.locals.course_instance.id,
          assessmentId: res.locals.assessment.id,
        }),
        authn_user_id: res.locals.authn_user.id,
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
              courseInstanceId={res.locals.course_instance.id}
              assessmentId={res.locals.assessment.id}
              urlPrefix={res.locals.urlPrefix}
              assessmentSetAbbr={res.locals.assessment_set.abbreviation}
              assessmentNumber={res.locals.assessment.number}
              groupWork={res.locals.assessment.team_work}
              multipleInstance={res.locals.assessment.multiple_instance}
              timezone={res.locals.course_instance.display_timezone}
              canEdit={res.locals.authz_data.has_course_instance_permission_edit}
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
