import { Router } from 'express';

import * as sqldb from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { AssessmentLogRowSchema } from './AssessmentLogsTable.js';
import { InstructorAssessmentLogs } from './instructorAssessmentLogs.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { assessment, course_instance } = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    const logs = await sqldb.queryRows(
      sql.select_log_job_sequences,
      { assessment_id: assessment.id },
      AssessmentLogRowSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment logs',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'settings',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <InstructorAssessmentLogs
            courseInstanceId={course_instance.id}
            assessmentId={assessment.id}
            timezone={course_instance.display_timezone}
            logs={logs}
            search={getUrl(req).search}
          />
        ),
      }),
    );
  }),
);

export default router;
