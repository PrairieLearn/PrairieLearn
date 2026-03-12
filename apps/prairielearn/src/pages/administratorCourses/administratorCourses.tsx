import { Router } from 'express';

import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { AdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { selectPendingCourseRequests } from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourses } from './administratorCourses.html.js';
import { CourseWithInstitutionSchema } from './administratorCourses.shared.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const course_requests = await selectPendingCourseRequests();
    const institutions = await selectAllInstitutions();
    const availableTimezones = await getCanonicalTimezones();
    const courses = await sqldb.queryRows(sql.select_courses, CourseWithInstitutionSchema);
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
        pageTitle: 'Courses',
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
            <AdministratorCourses
              courseRequests={course_requests}
              institutions={AdminInstitutionSchema.array().parse(institutions)}
              availableTimezones={availableTimezones}
              courses={courses}
              coursesRoot={config.coursesRoot}
              trpcCsrfToken={trpcCsrfToken}
              urlPrefix={res.locals.urlPrefix}
              courseRepoDefaultBranch={config.courseRepoDefaultBranch}
              aiSecretsConfigured={!!config.administratorOpenAiApiKey}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
