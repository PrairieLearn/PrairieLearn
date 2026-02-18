import z from 'zod';

import type { HtmlValue } from '@prairielearn/html';

import type { UntypedResLocals } from '../lib/res-locals.types.js';

export const NavbarTypeSchema = z
  .enum([
    'plain',
    'student',
    'instructor',
    'administrator_institution',
    'administrator',
    'institution',
    'public',
  ])
  .optional();

export type NavbarType = z.infer<typeof NavbarTypeSchema>;

export const NavPageSchema = z
  .enum([
    'public_assessment',
    'public_question',
    'public_questions',
    'instance_admin',
    'course_admin',
    'assessment',
    'question',
    'admin',
    'administrator_institution',
    'institution_admin',
    'assessments',
    'gradebook',
    'assessment_instance',
    'workspace',
    'effective',
    'lti13_course_navigation',
    'error',
    'enroll',
    'request_course',
    'home',
    'upgrade',
    'user_settings',
    'password',
  ])
  .optional();

export type NavPage = z.infer<typeof NavPageSchema>;

// This type is provisionally very lenient, to avoid problems with existing
// code. A future version where navSubPage is more strictly defined can set
// this to a more specific enum-like type.
export type NavSubPage = string | undefined;

export interface NavContext {
  type: NavbarType;
  page: NavPage;
  subPage?: NavSubPage;
}

export interface TabInfo {
  activeSubPage: NavSubPage | NavSubPage[];
  urlSuffix: string | ((resLocals: UntypedResLocals) => string);
  iconClasses: string;
  tabLabel: string;
  htmlSuffix?: (resLocals: UntypedResLocals) => HtmlValue;
  renderCondition?: (resLocals: UntypedResLocals) => boolean;
}
