import type { StaffCourseInstanceContext } from '../../lib/client/page-context.js';

export interface SettingsFormValues {
  ciid: string;
  long_name: string;
  display_timezone: string;
  group_assessments_by: StaffCourseInstanceContext['course_instance']['assessments_group_by'];
  hide_in_enroll_page: boolean;
  self_enrollment_enabled: boolean;
  self_enrollment_requires_secret_link: boolean;
  self_enrollment_enabled_before_date: string | null;
}
