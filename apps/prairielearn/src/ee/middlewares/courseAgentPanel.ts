import { config } from '../../lib/config.js';
import { CourseAgentPanelStateSchema } from '../../lib/course-agent-panel.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { hasCourseAgentOwnerAccess } from '../lib/course-agent/access.js';
import { renderCourseAgentPanel } from '../lib/course-agent/panel.js';
import { newWorkEnabled } from '../lib/course-agent/service.js';

export default typedAsyncHandler<'course'>(async (req, res, next) => {
  const fetchDestination = req.get('Sec-Fetch-Dest');
  if (
    req.method !== 'GET' ||
    !req.accepts('html') ||
    (fetchDestination && fetchDestination !== 'document') ||
    req.path.includes('/trpc') ||
    req.path.includes('/course-agent/') ||
    !config.courseAgent ||
    !res.locals.authz_data.has_course_permission_own ||
    res.locals.course.example_course
  ) {
    next();
    return;
  }
  const scope = {
    course_id: res.locals.course.id,
    user_id: res.locals.authz_data.user.id,
    authn_user_id: res.locals.authz_data.authn_user.id,
  };
  if (!(await hasCourseAgentOwnerAccess(scope))) {
    next();
    return;
  }
  const canStartNewWork = await newWorkEnabled(scope, res.locals.course);
  if (canStartNewWork) {
    res.locals.course_agent_panel = renderCourseAgentPanel({
      courseId: res.locals.course.id,
      userId: scope.user_id,
      authnUserId: scope.authn_user_id,
      userName: res.locals.user.name ?? res.locals.user.uid,
      timezone: res.locals.course.display_timezone,
      initialPanelState: CourseAgentPanelStateSchema.parse({}),
      canStartNewWork,
    });
  }
  next();
});
