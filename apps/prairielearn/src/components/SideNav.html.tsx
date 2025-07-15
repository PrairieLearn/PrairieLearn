import clsx from 'clsx';

import { type HtmlValue, html } from '@prairielearn/html';

import { isEnterprise } from '../lib/license.js';

import { IssueBadge } from './IssueBadge.html.js';
import type { NavPage, NavSubPage } from './Navbar.types.js';
import { ProgressCircle } from './ProgressCircle.html.js';

interface SideNavTabInfo {
  /** For the side nav tab to be active, the current navPage must be in activePages. */
  activePages: NavPage[];
  /**
   * For navPages in checkActiveSubPageForPages, the current subPage must also be in activeSubPages for
   * the side nav tab to be active.
   *
   * For all other navPages, only the current navPage must be in activePages.
   *
   * If not specified, activeSubPages will be checked on all pages.
   **/
  checkActiveSubPageForPages?: NavPage[];
  /** For the side nav tab to be active, the navSubPage must be in activeSubPages. */
  activeSubPages: NavSubPage[];
  urlSuffix: string | ((resLocals: Record<string, any>) => string);
  iconClasses: string;
  tabLabel: string;
  tabTooltip?: string;
  htmlSuffix?: (resLocals: Record<string, any>) => HtmlValue;
  renderCondition?: (resLocals: Record<string, any>) => boolean;
}

const sideNavPagesTabs = {
  course_admin: [
    {
      activePages: ['course_admin'],
      activeSubPages: ['getting_started'],
      urlSuffix: '/course_admin/getting_started',
      iconClasses: 'fa fa-tasks fa-fw',
      tabLabel: 'Getting Started',
      htmlSuffix: ({
        navbarCompleteGettingStartedTasksCount,
        navbarTotalGettingStartedTasksCount,
      }) =>
        ProgressCircle({
          value: navbarCompleteGettingStartedTasksCount,
          maxValue: navbarTotalGettingStartedTasksCount,
          className: 'ms-auto',
        }),
      renderCondition: ({ authz_data, course }) =>
        authz_data.has_course_permission_edit && course.show_getting_started,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['instances'],
      urlSuffix: '/course_admin/instances',
      iconClasses: 'fas fa-chalkboard-teacher fa-fw',
      tabLabel: 'Course instances',
    },
    {
      activePages: ['course_admin', 'question'],
      checkActiveSubPageForPages: ['course_admin'],
      activeSubPages: ['questions'],
      urlSuffix: '/course_admin/questions',
      iconClasses: 'fa fa-question fa-fw',
      tabLabel: 'Questions',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_preview,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['issues'],
      urlSuffix: '/course_admin/issues',
      iconClasses: 'fas fa-bug fa-fw',
      tabLabel: 'Issues',
      htmlSuffix: ({ navbarOpenIssueCount }) =>
        IssueBadge({ count: navbarOpenIssueCount, suppressLink: true, className: 'ms-auto' }),
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['staff'],
      urlSuffix: '/course_admin/staff',
      iconClasses: 'fas fa-users fa-fw',
      tabLabel: 'Staff',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_own,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['syncs'],
      urlSuffix: '/course_admin/syncs',
      iconClasses: 'fas fa-sync-alt fa-fw',
      tabLabel: 'Sync',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
    },

    {
      activePages: ['course_admin'],
      activeSubPages: ['file_view', 'file_edit'],
      urlSuffix: '/course_admin/file_view',
      iconClasses: 'fa fa-edit fa-fw',
      tabLabel: 'Files',
      tabTooltip: 'Course files',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['settings', 'sets', 'modules', 'tags', 'topics', 'sharing'],
      urlSuffix: '/course_admin/settings',
      iconClasses: 'fas fa-cog fa-fw',
      tabLabel: 'Settings',
      tabTooltip: 'Course settings',
    },
  ],
  instance_admin: [
    {
      activePages: ['instance_admin', 'assessments', 'assessment', 'assessment_instance'],
      checkActiveSubPageForPages: ['instance_admin'],
      activeSubPages: ['assessments'],
      urlSuffix: '/instance_admin/assessments',
      iconClasses: 'fa fa-list fa-fw',
      tabLabel: 'Assessments',
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['gradebook'],
      urlSuffix: '/instance_admin/gradebook',
      iconClasses: 'fas fa-balance-scale fa-fw',
      tabLabel: 'Gradebook',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['file_view', 'file_edit'],
      urlSuffix: '/instance_admin/file_view',
      iconClasses: 'fa fa-edit fa-fw',
      tabLabel: 'Files',
      tabTooltip: 'Course instance files',
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['integrations'],
      urlSuffix: '/instance_admin/lti13_instance',
      iconClasses: 'fas fa-school-flag fa-fw',
      tabLabel: 'Integrations',
      renderCondition: () => isEnterprise(),
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['settings', 'access', 'lti', 'billing'],
      urlSuffix: '/instance_admin/settings',
      iconClasses: 'fas fa-cog fa-fw',
      tabLabel: 'Settings',
      tabTooltip: 'Course instance settings',
    },
  ],
} satisfies Partial<Record<Exclude<NavPage, undefined>, SideNavTabInfo[]>>;

export function SideNav({
  resLocals,
  page,
  subPage,
}: {
  resLocals: Record<string, any>;
  page: NavPage;
  subPage: NavSubPage;
}) {
  return html`
    ${CourseNav({
      resLocals,
      page,
      subPage,
    })}
    ${resLocals.course_instance
      ? CourseInstanceNav({
          resLocals,
          page,
          subPage,
        })
      : ''}
  `;
}

function CourseNav({
  resLocals,
  page,
  subPage,
}: {
  resLocals: Record<string, any>;
  page: NavPage;
  subPage: NavSubPage;
}) {
  const courseSideNavPageTabs = sideNavPagesTabs.course_admin;

  return html`
    <div class="side-nav-header">
      <p class="header-text">Course</p>
      <button
        id="side-nav-toggler"
        type="button"
        data-bs-toggle="tooltip"
        data-bs-placement="right"
        data-bs-title="${resLocals.side_nav_expanded ? 'Collapse side nav' : 'Expand side nav'}"
      >
        <i
          id="side-nav-toggler-icon"
          class="${clsx(
            'bi',
            resLocals.side_nav_expanded ? 'bi-arrow-bar-left' : 'bi-arrow-bar-right',
          )}"
        ></i>
      </button>
    </div>
    <div class="side-nav-group">
      <div id="course-dropdown" class="dropdown">
        <button
          type="button"
          class="btn dropdown-toggle border border-gray bg-white w-100 d-flex justify-content-between align-items-center mb-2"
          aria-label="Change course"
          aria-haspopup="true"
          aria-expanded="false"
          data-bs-toggle="dropdown"
          data-bs-boundary="window"
          hx-get="/pl/navbar/course/${resLocals.course.id}/switcher"
          hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
          hx-target="#sideNavCourseDropdownContent"
        >
          <span> ${resLocals.course.short_name} </span>
        </button>
        <div class="dropdown-menu py-0 overflow-hidden">
          <div
            id="sideNavCourseDropdownContent"
            style="max-height: 50vh"
            class="overflow-auto py-2"
          >
            <div class="d-flex justify-content-center">
              <div class="spinner-border spinner-border-sm" role="status">
                <span class="visually-hidden">Loading courses...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${courseSideNavPageTabs.map((tabInfo) =>
        SideNavLink({
          resLocals,
          navPage: page,
          navSubPage: subPage,
          tabInfo,
        }),
      )}
    </div>
  `;
}

function CourseInstanceNav({
  resLocals,
  page,
  subPage,
}: {
  resLocals: Record<string, any>;
  page: NavPage;
  subPage: NavSubPage;
}) {
  const courseInstanceSideNavPageTabs = sideNavPagesTabs.instance_admin;

  return html`
    <div class="side-nav-header">
      <div class="header-text">Course instance</div>
    </div>
    <div class="side-nav-group mb-3">
      <div>
        <div id="course-instance-dropdown" class="dropdown">
          <button
            type="button"
            class="btn dropdown-toggle border border-gray bg-white w-100 d-flex justify-content-between align-items-center mb-2"
            aria-label="Change course instance"
            aria-haspopup="true"
            aria-expanded="false"
            data-bs-toggle="dropdown"
            data-bs-boundary="window"
            hx-get="/pl/navbar/course/${resLocals.course.id}/course_instance_switcher/${resLocals
              .course_instance?.id ?? ''}"
            hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
            hx-target="#sideNavCourseInstancesDropdownContent"
          >
            <span> ${resLocals.course_instance?.short_name ?? 'Select a course instance...'} </span>
          </button>
          <div class="dropdown-menu py-0 overflow-hidden">
            <div
              id="sideNavCourseInstancesDropdownContent"
              style="max-height: 50vh"
              class="overflow-auto py-2"
            >
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="visually-hidden">Loading course instances...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${resLocals.course_instance
          ? courseInstanceSideNavPageTabs.map((tabInfo) =>
              SideNavLink({
                resLocals,
                navPage: page,
                navSubPage: subPage,
                tabInfo,
              }),
            )
          : ''}
      </div>
    </div>
  `;
}

function SideNavLink({
  resLocals,
  navPage,
  navSubPage,
  tabInfo,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
  navSubPage: NavSubPage;
  tabInfo: SideNavTabInfo;
}) {
  const { urlPrefix } = resLocals;
  const {
    activePages,
    checkActiveSubPageForPages,
    activeSubPages,
    iconClasses,
    tabLabel,
    tabTooltip,
    htmlSuffix,
    renderCondition,
  } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  let isActive = activePages.includes(navPage);
  if (isActive && (!checkActiveSubPageForPages || checkActiveSubPageForPages.includes(navPage))) {
    isActive = activeSubPages.includes(navSubPage);
  }

  const sideNavExpanded = resLocals.side_nav_expanded;

  return html`
    <a
      href="${urlPrefix}${urlSuffix}"
      class="side-nav-link ${isActive ? 'side-nav-link-active' : ''}"
      aria-current="${isActive ? 'page' : ''}"
      data-bs-toggle="${!sideNavExpanded ? 'tooltip' : ''}"
      data-bs-placement="right"
      data-bs-title="${tabTooltip ?? tabLabel}"
    >
      <i class="icon flex-shrink-0 ${iconClasses}"></i>
      <span class="side-nav-link-text">${tabLabel}</span>
      <div class="suffix">${htmlSuffix?.(resLocals) || ''}</div>
    </a>
  `;
}
