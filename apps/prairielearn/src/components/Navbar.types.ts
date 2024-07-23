export type NavbarType =
  | 'plain'
  | 'student'
  | 'instructor'
  | 'administrator_institution'
  | 'institution'
  | 'public'
  | undefined;

export type NavPage =
  | 'instance_admin'
  | 'course_admin'
  | 'assessment'
  | 'question'
  | 'admin'
  | 'administrator_institution'
  | 'institution_admin'
  | 'assessments'
  | 'gradebook'
  | 'assessment_instance'
  | 'effective'
  | 'lti13_course_navigation'
  | 'error'
  | 'enroll'
  | 'request_course'
  | 'home'
  | 'news_item'
  | 'news_items'
  | 'user_settings'
  | undefined;

export type NavSubPage = string | undefined;
