import { Router } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { AgentConversationsPage } from './components/AgentConversationsPage.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'course' | 'course-instance'>(async (_req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (!(await features.enabledFromLocals('cloud-agent', res.locals))) {
      throw new HttpStatusError(403, 'Access denied (feature not available)');
    }
    if (!authzData.has_course_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be course editor)');
    }
    if (course.example_course) {
      throw new HttpStatusError(403, 'Access denied. Cannot use the agent in the example course.');
    }

    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: getCourseTrpcUrl(course.id), authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Course agent',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'agents',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <AgentConversationsPage
              courseId={course.id}
              displayTimezone={course.display_timezone}
              isDevMode={config.devMode}
              trpcCsrfToken={trpcCsrfToken}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
