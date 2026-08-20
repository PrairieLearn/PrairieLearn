import type { Lti13CourseInstance } from '../../lib/db-types.js';

export function getLti13CourseDisplayName(
  course: Pick<Lti13CourseInstance, 'context_id' | 'context_label' | 'context_title'>,
): string {
  return course.context_label || course.context_title || course.context_id;
}
