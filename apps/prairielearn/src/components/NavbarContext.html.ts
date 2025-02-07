import { html, type HtmlValue } from '@prairielearn/html';

import { IssueBadge } from './IssueBadge.html.js';
import { type NavPage, type NavSubPage } from './Navbar.types.js';

// todo: is there a better place for this code?
interface TabInfo {
  activeSubPage: NavSubPage | NavSubPage[];
  urlSuffix: string | ((resLocals: Record<string, any>) => string);
  iconClasses: string;
  tabLabel: string;
  htmlSuffix?: (resLocals: Record<string, any>) => HtmlValue;
  renderCondition?: (resLocals: Record<string, any>) => boolean;
}

// Mapping navPage to navtab sets
const navPagesTabs: Partial<Record<Exclude<NavPage, undefined>, TabInfo[]>> = {
  public_question: [
    {
      activeSubPage: 'file_view',
      urlSuffix: ({ question }) => `/question/${question.id}/file_view`,
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
      renderCondition: ({ question }) => question.share_source_publicly,
    },
    {
      activeSubPage: 'preview',
      urlSuffix: ({ question }) => `/question/${question.id}/preview`,
      iconClasses: 'fas fa-tv',
      tabLabel: 'Preview',
    },
  ],
  assessment: [
    {
      activeSubPage: 'access',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/access`,
      iconClasses: 'far fa-calendar-alt',
      tabLabel: 'Access',
    },
    {
      activeSubPage: 'downloads',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/downloads`,
      iconClasses: 'fas fa-download',
      tabLabel: 'Downloads',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/file_view`,
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
    },
    {
      activeSubPage: 'groups',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/groups`,
      iconClasses: 'fas fa-users',
      tabLabel: 'Groups',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activeSubPage: 'questions',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/questions`,
      iconClasses: 'far fa-file-alt',
      tabLabel: 'Questions',
    },
    {
      activeSubPage: 'question_statistics',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/question_statistics`,
      iconClasses: 'fas fa-table',
      tabLabel: 'Question stats',
    },
    {
      activeSubPage: 'manual_grading',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/manual_grading`,
      iconClasses: 'fas fa-marker',
      tabLabel: 'Manual Grading',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activeSubPage: 'regrading',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/regrading`,
      iconClasses: 'fa fa-sync',
      tabLabel: 'Regrading',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activeSubPage: 'settings',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/settings`,
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
    },
    {
      activeSubPage: 'assessment_statistics',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/assessment_statistics`,
      iconClasses: 'fas fa-chart-bar',
      tabLabel: 'Statistics',
    },
    {
      activeSubPage: 'instances',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/instances`,
      iconClasses: 'fas fa-user-graduate',
      tabLabel: 'Students',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activeSubPage: 'uploads',
      urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/uploads`,
      iconClasses: 'fas fa-upload',
      tabLabel: 'Uploads',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
  ],
  question: [
    {
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: ({ question }) => `/question/${question.id}/file_view`,
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
      renderCondition: ({ authz_data, course, question }) =>
        authz_data.has_course_permission_view && question.course_id === course.id,
    },
    {
      activeSubPage: 'preview',
      urlSuffix: ({ question }) => `/question/${question.id}/preview`,
      iconClasses: 'fas fa-tv',
      tabLabel: 'Preview',
    },
    {
      activeSubPage: 'settings',
      urlSuffix: ({ question }) => `/question/${question.id}/settings`,
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
      renderCondition: ({ course, question }) => question.course_id === course.id,
    },
    {
      activeSubPage: 'statistics',
      urlSuffix: ({ question }) => `/question/${question.id}/statistics`,
      iconClasses: 'fas fa-chart-bar',
      tabLabel: 'Statistics',
      renderCondition: ({ course, question }) => question.course_id === course.id,
    },
    {
      activeSubPage: 'issues',
      urlSuffix: ({ question }) =>
        `/course_admin/issues?q=is%3Aopen+qid%3A${encodeURIComponent(question.qid)}`,
      iconClasses: 'fas fa-bug',
      tabLabel: 'Issues',
      htmlSuffix: (resLocals) =>
        IssueBadge({ count: resLocals.open_issue_count, suppressLink: true, className: 'ml-2' }),
      renderCondition: ({ course, question }) => question.course_id === course.id,
    },
  ],
  admin: [
    {
      activeSubPage: 'administrators',
      urlSuffix: '/administrator/admins',
      iconClasses: 'fas fa-user-shield',
      tabLabel: 'Administrators',
    },
    {
      activeSubPage: 'institutions',
      urlSuffix: '/administrator/institutions',
      iconClasses: 'fa fa-building-columns',
      tabLabel: 'Institutions',
    },
    {
      activeSubPage: 'courses',
      urlSuffix: '/administrator/courses',
      iconClasses: 'fa fa-chalkboard',
      tabLabel: 'Courses',
    },
    {
      activeSubPage: 'networks',
      urlSuffix: '/administrator/networks',
      iconClasses: 'fas fa-network-wired',
      tabLabel: 'Exam Networks',
    },
    {
      activeSubPage: 'queries',
      urlSuffix: '/administrator/queries',
      iconClasses: 'fas fa-database',
      tabLabel: 'Queries',
    },
    {
      activeSubPage: 'workspaces',
      urlSuffix: '/administrator/workspaces',
      iconClasses: 'fas fa-laptop-code',
      tabLabel: 'Workspaces',
    },
    {
      activeSubPage: 'features',
      urlSuffix: '/administrator/features',
      iconClasses: 'fas fa-toggle-on',
      tabLabel: 'Features',
    },
    {
      activeSubPage: 'batchedMigrations',
      urlSuffix: '/administrator/batchedMigrations',
      iconClasses: 'fas fa-database',
      tabLabel: 'Batched Migrations',
    },
    {
      activeSubPage: 'settings',
      urlSuffix: '/administrator/settings',
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
    },
  ],
  administrator_institution: [
    {
      activeSubPage: 'general',
      urlSuffix: '',
      iconClasses: 'fa fa-gear',
      tabLabel: 'General',
    },
    {
      activeSubPage: 'admins',
      urlSuffix: '/admins',
      iconClasses: 'fa fa-user-shield',
      tabLabel: 'Admins',
    },
    {
      activeSubPage: 'courses',
      urlSuffix: '/courses',
      iconClasses: 'fa fa-chalkboard',
      tabLabel: 'Courses',
    },
    {
      activeSubPage: 'sso',
      urlSuffix: '/sso',
      iconClasses: 'fa fa-users',
      tabLabel: 'Single sign-on',
    },
    {
      activeSubPage: 'saml',
      urlSuffix: '/saml',
      iconClasses: 'fa fa-key',
      tabLabel: 'SAML',
    },
    {
      activeSubPage: 'lti13',
      urlSuffix: '/lti13',
      iconClasses: 'fa fa-school-flag',
      tabLabel: 'LTI 1.3',
      renderCondition: (resLocals) => resLocals.lti13_enabled,
    },
  ],
  institution_admin: [
    {
      activeSubPage: 'admins',
      urlSuffix: '/admins',
      iconClasses: 'fa fa-user-shield',
      tabLabel: 'Admins',
    },
    {
      activeSubPage: 'courses',
      urlSuffix: '/courses',
      iconClasses: 'fa fa-chalkboard',
      tabLabel: 'Courses',
    },
  ],
};

export function ContextNavigation({
  resLocals,
  navPage,
  navSubPage,
  newNavEnabled = false,
  fullWidth = false,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
  navSubPage: NavSubPage;
  newNavEnabled?: boolean;
  fullWidth?: boolean;
}) {
  if (!navPage) return '';
  const navPageTabs = navPagesTabs[navPage];
  if (!navPageTabs) return '';

  return html`
    <nav class="${newNavEnabled && !fullWidth ? 'container' : ''}">
      <ul class="nav nav-tabs pl-nav-tabs-bar mt-2 mb-4">
        ${navPageTabs.map((tabInfo) => NavbarTab({ navPage, navSubPage, resLocals, tabInfo }))}
      </ul>
    </nav>
  `;
}

function NavbarTab({
  navPage,
  navSubPage,
  resLocals,
  tabInfo,
}: {
  navPage: NavPage;
  navSubPage: NavSubPage;
  resLocals: Record<string, any>;
  tabInfo: TabInfo;
}) {
  const { urlPrefix } = resLocals;
  const { activeSubPage, iconClasses, tabLabel, htmlSuffix, renderCondition } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  const activeClasses =
    navSubPage === activeSubPage ||
    (Array.isArray(activeSubPage) && navSubPage != null && activeSubPage.includes(navSubPage))
      ? 'active text-dark'
      : 'text-secondary';

  return html`
    <li class="nav-item">
      <a
        class="nav-link d-flex align-items-center ${activeClasses}"
        href="${urlPrefix}${urlSuffix}"
      >
        <i class="mr-1 ${iconClasses}"></i>${tabLabel}${htmlSuffix?.(resLocals) || ''}
      </a>
    </li>
  `;
}
