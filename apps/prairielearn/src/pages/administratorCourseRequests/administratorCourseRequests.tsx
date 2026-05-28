import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { AdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { selectAllCourseRequests, selectPendingCourseRequests } from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourseRequests } from './administratorCourseRequests.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { urlPrefix, authn_user } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'instructor',
      withAuthzData: false,
    });
    const showAll = req.query.status === 'all';
    const rows = showAll ? await selectAllCourseRequests() : await selectPendingCourseRequests();
    const institutions = await selectAllInstitutions();
    const availableTimezones = await getCanonicalTimezones(
      institutions.map((i) => i.display_timezone),
    );
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: `${urlPrefix}/administrator/trpc`,
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course Requests',
        navContext: {
          type: 'administrator',
          page: 'admin',
          subPage: 'courseRequests',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <AdministratorCourseRequests
              rows={rows}
              institutions={AdminInstitutionSchema.array().parse(institutions)}
              availableTimezones={availableTimezones}
              coursesRoot={config.coursesRoot}
              trpcCsrfToken={trpcCsrfToken}
              aiSecretsConfigured={!!config.administratorOpenAiApiKey}
              showAll={showAll}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
