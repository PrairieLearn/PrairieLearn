import { html, type HtmlValue } from '@prairielearn/html';

import type { Course } from '../lib/db-types.js';

import type { NavPage, NavSubPage } from './Navbar.types.js';
import { ProgressCircle } from './ProgressCircle.html.js';

interface SideNavTabInfo {
  /** We must be on activePage for the tab to be active.  */
  activePage: NavPage[];
  /**
   * activeSubPage will only be checked for these pages.
   * If unspecified, activeSubPage will be checked on all pages.
   **/
  checkActiveSubPageForPages?: NavPage[];
  /** We also must be on activeSubPage for the tab to be active.  */
  activeSubPage: NavSubPage[];
  urlSuffix: string | ((resLocals: Record<string, any>) => string);
  iconClasses: string;
  tabLabel: string;
  htmlSuffix?: (resLocals: Record<string, any>) => HtmlValue;
  renderCondition?: (resLocals: Record<string, any>) => boolean;
}

const sideNavPagesTabs: Partial<Record<Exclude<NavPage, undefined>, SideNavTabInfo[]>> = {
  instance_admin: [
    {
      activePage: ['instance_admin'],
      activeSubPage: ['access'],
      urlSuffix: '/instance_admin/access',
      iconClasses: 'far fa-calendar-alt',
      tabLabel: 'Access',
    },
    {
      activePage: ['instance_admin', 'assessments', 'assessment', 'assessment_instance'],
      checkActiveSubPageForPages: ['instance_admin'],
      activeSubPage: ['assessments'],
      urlSuffix: '/instance_admin/assessments',
      iconClasses: 'fa fa-list',
      tabLabel: 'Assessments',
    },
    {
      activePage: ['instance_admin'],
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: '/instance_admin/file_view',
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
    },
    {
      activePage: ['gradebook'],
      activeSubPage: ['gradebook'],
      urlSuffix: '/instance_admin/gradebook',
      iconClasses: 'fas fa-balance-scale',
      tabLabel: 'Gradebook',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activePage: ['instance_admin'],
      activeSubPage: ['lti'],
      urlSuffix: '/instance_admin/lti',
      iconClasses: 'fas fa-graduation-cap',
      tabLabel: 'LTI',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
    },
    {
      activePage: ['instance_admin'],
      activeSubPage: ['lti13'],
      urlSuffix: '/instance_admin/lti13_instance',
      iconClasses: 'fas fa-school-flag',
      tabLabel: 'LTI 1.3',
      renderCondition: (resLocals) => resLocals.lti13_enabled,
    },
    {
      activePage: ['instance_admin'],
      activeSubPage: ['billing'],
      urlSuffix: '/instance_admin/billing',
      iconClasses: 'fas fa-credit-card',
      tabLabel: 'Billing',
      renderCondition: (resLocals) => resLocals.billing_enabled,
    },
    {
      activePage: ['instance_admin'],
      activeSubPage: ['settings'],
      urlSuffix: '/instance_admin/settings',
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
    },
  ],
  course_admin: [
    {
      activePage: ['course_admin'],
      activeSubPage: ['getting_started'],
      urlSuffix: '/course_admin/getting_started',
      iconClasses: 'fa fa-tasks',
      tabLabel: 'Getting Started',
      htmlSuffix: ({
        navbarCompleteGettingStartedTasksCount,
        navbarTotalGettingStartedTasksCount,
      }) =>
        ProgressCircle({
          value: navbarCompleteGettingStartedTasksCount,
          maxValue: navbarTotalGettingStartedTasksCount,
        }),
      renderCondition: ({ authz_data, course }) =>
        authz_data.has_course_permission_edit && course.show_getting_started,
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['instances'],
      urlSuffix: '/course_admin/instances',
      iconClasses: 'fas fa-chalkboard-teacher',
      tabLabel: 'Course Instances',
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['questions'],
      urlSuffix: '/course_admin/questions',
      iconClasses: 'fa fa-question',
      tabLabel: 'Questions',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_preview,
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['issues'],
      urlSuffix: '/course_admin/issues',
      iconClasses: 'fas fa-bug',
      tabLabel: 'Issues',
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['sharing'],
      urlSuffix: '/course_admin/sharing',
      iconClasses: 'fas fa-share-nodes',
      tabLabel: 'Sharing',
      renderCondition: (resLocals) => resLocals.question_sharing_enabled,
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['syncs'],
      urlSuffix: '/course_admin/syncs',
      iconClasses: 'fas fa-sync-alt',
      tabLabel: 'Sync',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
    },

    {
      activePage: ['course_admin'],
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: '/course_admin/file_view',
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
    },
    {
      activePage: ['course_admin'],
      activeSubPage: ['settings'],
      urlSuffix: '/course_admin/settings',
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
    },
  ],
};

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
    <div class="side-nav">
      ${CourseNav({
        resLocals,
        page,
        subPage,
      })}
      ${resLocals.course_instance && resLocals.course_instances
        ? CourseInstanceNav({
            resLocals,
            page,
            subPage,
          })
        : ''}
    </div>
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
  if (!courseSideNavPageTabs) return '';

  return html`
    <div class="side-nav-section-header">Course</div>
    <div class="side-nav-group mb-3">
      <div class="dropdown">
        <button
          type="button"
          class="btn dropdown-toggle dropdown-menu-right border border-gray bg-white w-100 d-flex justify-content-between align-items-center"
          data-toggle="dropdown"
          aria-haspopup="true"
          aria-expanded="false"
          data-boundary="window"
        >
          <span> ${resLocals.course.short_name} </span>
        </button>
        <div class="dropdown-menu">
          ${resLocals.courses.map((course: Course) => {
            return html`
              <a
                class="dropdown-item ${`${resLocals.course.id}` === `${course.id}` ? 'active' : ''}"
                href="/pl/course/${course.id}/course_admin"
              >
                ${course.short_name}
              </a>
            `;
          })}
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
  if (!courseInstanceSideNavPageTabs) return '';

  return html`
    <div class="side-nav-section-header">Course instance</div>
    <div class="side-nav-group mb-3">
      <div>
        <div class="dropdown">
          <button
            type="button"
            class="btn dropdown-toggle dropdown-menu-right border border-gray bg-white w-100 d-flex justify-content-between align-items-center"
            data-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
            data-boundary="window"
          >
            <span> ${resLocals.course_instance.short_name} </span>
          </button>
          <div class="dropdown-menu">
            ${resLocals.course_instances.map((ci) => {
              return html`
                <a
                  class="dropdown-item ${`${resLocals.course_instance.id}` === `${ci.id}`
                    ? 'active'
                    : ''}"
                  href="/pl/course_instance/${ci.id}/instructor/instance_admin"
                >
                  ${ci.short_name}
                </a>
              `;
            })}
          </div>
          ${courseInstanceSideNavPageTabs.map((tabInfo) =>
            SideNavLink({
              resLocals,
              navPage: page,
              navSubPage: subPage,
              tabInfo,
            }),
          )}
        </div>
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
    activePage,
    checkActiveSubPageForPages,
    activeSubPage,
    iconClasses,
    tabLabel,
    htmlSuffix,
    renderCondition,
  } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  let isActive = activePage.includes(navPage);
  if (isActive && (!checkActiveSubPageForPages || checkActiveSubPageForPages.includes(navPage))) {
    isActive = activeSubPage.includes(navSubPage);
  }

  return html`
    <a
      href="${urlPrefix}${urlSuffix}"
      class="side-nav-link ${isActive ? 'side-nav-link-active' : ''}"
    >
      <i class="${iconClasses}"></i>
      ${tabLabel} ${htmlSuffix?.(resLocals) || ''}
    </a>
  `;
}
