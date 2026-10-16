import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { renderCourseAgentPanel } from '../lib/course-agent/panel.js';

/**
 * Renders the course agent panel into `res.locals.course_agent_panel` for
 * instructor HTML pages, where PageLayout picks it up.
 */
export default typedAsyncHandler<'course'>(async (req, res, next) => {
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

  res.locals.course_agent_panel = renderCourseAgentPanel({
    courseId: res.locals.course.id,
    authnUserId: res.locals.authn_user.id,
    initialOpen: req.session.course_agent_panel_open === true,
  });
  next();
});
