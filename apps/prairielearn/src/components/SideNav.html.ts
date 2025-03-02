import { html, type HtmlValue } from '@prairielearn/html';

import type { Course } from '../lib/db-types.js';

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
          options: {
            mlAuto: true,
          },
        }),
      renderCondition: ({ authz_data, course }) =>
        authz_data.has_course_permission_edit && course.show_getting_started,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['instances'],
      urlSuffix: '/course_admin/instances',
      iconClasses: 'fas fa-chalkboard-teacher fa-fw',
      tabLabel: 'Course Instances',
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
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
    },
    {
      activePages: ['course_admin'],
      activeSubPages: ['settings', 'sets', 'modules', 'tags', 'topics', 'sharing'],
      urlSuffix: '/course_admin/settings',
      iconClasses: 'fas fa-cog fa-fw',
      tabLabel: 'Settings',
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
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['lti13'],
      urlSuffix: '/instance_admin/lti13_instance',
      iconClasses: 'fas fa-school-flag fa-fw',
      tabLabel: 'LTI 1.3',
      renderCondition: (resLocals) => resLocals.lti13_enabled,
    },
    {
      activePages: ['instance_admin'],
      activeSubPages: ['settings', 'access', 'lti', 'billing'],
      urlSuffix: '/instance_admin/settings',
      iconClasses: 'fas fa-cog fa-fw',
      tabLabel: 'Settings',
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
        <div class="dropdown-menu py-0 overflow-hidden">
          <div style="max-height: 50vh" class="overflow-auto">
            ${resLocals.courses.map((course: Course) => {
              return html`
                <a
                  class="dropdown-item ${`${resLocals.course.id}` === `${course.id}`
                    ? 'active'
                    : ''}"
                  aria-current="${`${resLocals.course.id}` === `${course.id}` ? 'page' : ''}"
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
          <div class="dropdown-menu py-0 overflow-hidden">
            <div style="max-height: 50vh" class="overflow-auto">
              ${resLocals.course_instances.map((ci) => {
                return html`
                  <a
                    class="dropdown-item ${`${resLocals.course_instance.id}` === `${ci.id}`
                      ? 'active'
                      : ''}"
                    aria-current="${`${resLocals.course_instance.id}` === `${ci.id}` ? 'page' : ''}"
                    href="/pl/course_instance/${ci.id}/instructor/instance_admin"
                  >
                    ${ci.short_name}
                  </a>
                `;
              })}
            </div>
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
    activePages,
    checkActiveSubPageForPages,
    activeSubPages,
    iconClasses,
    tabLabel,
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

  return html`
    <a
      href="${urlPrefix}${urlSuffix}"
      class="side-nav-link ${isActive ? 'side-nav-link-active' : ''}"
      aria-current="${isActive ? 'page' : ''}"
    >
      <i class="${iconClasses}"></i>
      ${tabLabel} ${htmlSuffix?.(resLocals) || ''}
    </a>
  `;
}
