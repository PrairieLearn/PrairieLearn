import type { ResLocalsForPage } from './res-locals.js';

export function canCollectUnsavedSubmissions(locals: ResLocalsForPage<'instance-question'>) {
  return (
    locals.authz_result.authorized_edit &&
    locals.authz_result.active &&
    !locals.authz_result.time_limit_expired &&
    locals.assessment_instance.open &&
    locals.instance_question.open &&
    locals.instance_question_info.question_access_mode !== 'read_only_lockpoint' &&
    (!locals.group_config?.has_roles || !!locals.group_role_permissions?.can_submit)
  );
}
