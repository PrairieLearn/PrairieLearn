import { HttpStatusError } from '@prairielearn/error';

import type {
  CourseAgentAuthzContext,
  CourseAgentAuthzRequirement,
  CourseAgentRelation,
} from './types.js';

function isElevatedStaff(context: CourseAgentAuthzContext): boolean {
  return context.isAdministrator || context.isInstitutionAdministrator;
}

export function contextSatisfiesAuthz(
  context: CourseAgentAuthzContext,
  requirement: CourseAgentAuthzRequirement,
): boolean {
  switch (requirement) {
    case 'course_permission_preview':
      return (
        isElevatedStaff(context) ||
        context.hasCoursePermissionPreview ||
        context.hasCoursePermissionView
      );
    case 'course_permission_view':
      return isElevatedStaff(context) || context.hasCoursePermissionView;
    case 'course_instance_permission_view':
      return (
        context.courseInstanceId != null &&
        (isElevatedStaff(context) || context.hasCourseInstancePermissionView)
      );
    case 'course_preview_or_instance_view':
      return (
        isElevatedStaff(context) ||
        context.hasCoursePermissionPreview ||
        context.hasCoursePermissionView ||
        (context.courseInstanceId != null && context.hasCourseInstancePermissionView)
      );
  }
}

export function assertCanAccessRelation(
  relation: CourseAgentRelation,
  context: CourseAgentAuthzContext,
): void {
  if (!context.courseId) {
    throw new HttpStatusError(403, 'Access denied');
  }

  if (relation.scopeAnchor === 'course_instance' && context.courseInstanceId == null) {
    if (relation.dataKind === 'student_data' || !hasCourseWideConfigurationAccess(context)) {
      throw new HttpStatusError(403, 'Access denied');
    }
  }

  if (relation.dataKind === 'student_data' && context.courseInstanceId == null) {
    throw new HttpStatusError(403, 'Access denied');
  }

  if (!contextSatisfiesAuthz(context, relation.authz)) {
    throw new HttpStatusError(403, 'Access denied');
  }
}

/**
 * Course-instance staff without course preview/view may only see configuration
 * that is required to interpret their authorized instance.
 */
export function hasCourseWideConfigurationAccess(context: CourseAgentAuthzContext): boolean {
  return (
    isElevatedStaff(context) ||
    context.hasCoursePermissionPreview ||
    context.hasCoursePermissionView
  );
}
