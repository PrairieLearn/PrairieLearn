import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { AdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { selectAllCourseRequests } from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourseRequests } from './administratorCourseRequests.html.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const rows = await selectAllCourseRequests();
    const institutions = await selectAllInstitutions();
    const availableTimezones = await getCanonicalTimezones();
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: `${res.locals.urlPrefix}/administrator/trpc`,
        authn_user_id: res.locals.authn_user.id,
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
          subPage: 'courses',
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
              urlPrefix={res.locals.urlPrefix}
              aiSecretsConfigured={!!config.administratorOpenAiApiKey}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
