import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectConversations } from '../../models/course-agent-conversation.js';
import { hasCourseAgentOwnerAccess } from '../lib/course-agent/access.js';
import { renderCourseAgentPanel } from '../lib/course-agent/panel.js';

export default typedAsyncHandler<'course'>(async (req, res, next) => {
  if (
    req.method === 'GET' &&
    config.courseAgent &&
    res.locals.authz_data.has_course_permission_own &&
    !res.locals.course.example_course &&
    (await hasCourseAgentOwnerAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.authz_data.user.id,
      authn_user_id: res.locals.authz_data.authn_user.id,
    })) &&
    ((await features.enabledFromLocals('course-agent', res.locals)) ||
      (
        await selectConversations({
          course_id: res.locals.course.id,
          user_id: res.locals.user.id,
          authn_user_id: res.locals.authz_data.authn_user.id,
        })
      ).length > 0)
  ) {
    res.locals.course_agent_panel = renderCourseAgentPanel(
      res.locals.course.id,
      res.locals.user.id,
      res.locals.authz_data.authn_user.id,
    );
  }
  next();
});
