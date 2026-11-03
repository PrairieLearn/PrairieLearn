import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { CourseAgentPanel } from '../components/courseAgent/CourseAgentPanel.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';

/**
 * Renders the course agent panel into `res.locals.course_agent_panel` for
 * instructor HTML pages, where PageLayout picks it up.
 */
export default typedAsyncHandler<'course'>(async (req, res, next) => {
  // API and background requests share this middleware but never render PageLayout.
  // Fetch metadata distinguishes browser navigations from fetches that also accept HTML.
  const fetchDestination = req.get('Sec-Fetch-Dest');
  if (
    req.method !== 'GET' ||
    !req.accepts('html') ||
    (fetchDestination && fetchDestination !== 'document') ||
    req.path.includes('/trpc') ||
    req.path.includes('/course_agent/') ||
    !(await courseAgentEnabled(res.locals))
  ) {
    next();
    return;
  }

  const courseId = res.locals.course.id;
  const authnUserId = res.locals.authn_user.id;
  // Bind both CSRF tokens to the authenticated user, including while emulating another user.
  const csrfToken = (url: string) =>
    generatePrefixCsrfToken({ url, authn_user_id: authnUserId }, config.secretKey);
  res.locals.course_agent_panel = renderHtml(
    <Hydrate>
      <CourseAgentPanel
        courseId={courseId}
        authnUserId={authnUserId}
        trpcCsrfToken={csrfToken(getCourseTrpcUrl(courseId))}
        chatCsrfToken={csrfToken(`/pl/course/${courseId}/course_agent`)}
        initialOpen={req.session.course_agent_panel_open === true}
      />
    </Hydrate>,
  );
  next();
});
