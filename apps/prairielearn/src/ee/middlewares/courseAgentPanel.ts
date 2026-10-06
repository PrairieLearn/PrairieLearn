import { extractPageContext } from '../../lib/client/page-context.js';
import { CourseAgentPanelStateSchema } from '../../lib/course-agent-panel.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectConversations } from '../../models/course-agent-conversation.js';
import { hasCourseAgentOwnerAccess } from '../lib/course-agent/access.js';
import { renderCourseAgentPanel } from '../lib/course-agent/panel.js';
import { newWorkEnabled, unavailableReason } from '../lib/course-agent/service.js';

export default typedAsyncHandler<'course'>(async (req, res, next) => {
  const { course, authz_data: authz } = extractPageContext(res.locals, {
    pageType: 'course',
    accessType: 'instructor',
  });
  const fetchDestination = req.get('Sec-Fetch-Dest');
  if (
    req.method !== 'GET' ||
    !req.accepts('html') ||
    (fetchDestination && fetchDestination !== 'document') ||
    req.path.includes('/trpc') ||
    req.path.includes('/course-agent/') ||
    !authz.has_course_permission_own ||
    course.example_course
  ) {
    next();
    return;
  }
  const scope = {
    course_id: course.id,
    user_id: authz.user.id,
    authn_user_id: authz.authn_user.id,
  };
  if (!(await hasCourseAgentOwnerAccess(scope))) {
    next();
    return;
  }
  const canStartNewWork = await newWorkEnabled(scope, course);
  const disabledReason = unavailableReason();
  if (canStartNewWork || (await selectConversations(scope)).length > 0) {
    res.locals.course_agent_panel = renderCourseAgentPanel({
      courseId: course.id,
      userId: scope.user_id,
      authnUserId: scope.authn_user_id,
      userName: authz.user.name ?? authz.user.uid,
      timezone: course.display_timezone,
      initialPanelState: CourseAgentPanelStateSchema.parse(
        req.session.course_agent_panels?.[`${scope.course_id}:${scope.user_id}`] ?? {},
      ),
      canStartNewWork: canStartNewWork && !disabledReason,
      disabledReason,
    });
  }
  next();
});
