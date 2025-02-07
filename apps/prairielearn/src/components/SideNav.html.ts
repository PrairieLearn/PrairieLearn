import { html, type HtmlValue } from '@prairielearn/html';

import type { NavPage, NavSubPage } from './Navbar.types.js';
import { ProgressCircle } from './ProgressCircle.html.js';

// TODO: merge this with the other TabInfo
interface TabInfo {
  activePage: NavPage | NavPage[];
  activeSubPage: NavSubPage | NavSubPage[];
  subPageRequiredFor?: NavPage[];
  urlSuffix: string | ((resLocals: Record<string, any>) => string);
  iconClasses: string;
  tabLabel: string;
  htmlSuffix?: (resLocals: Record<string, any>) => HtmlValue;
  renderCondition?: (resLocals: Record<string, any>) => boolean;
}

const sideNavPagesTabs: Partial<Record<Exclude<NavPage, undefined>, TabInfo[]>> = {
  instance_admin: [
    {
      activePage: 'instance_admin',
      activeSubPage: 'access',
      urlSuffix: '/instance_admin/access',
      iconClasses: 'far fa-calendar-alt',
      tabLabel: 'Access',
    },
    {
      activePage: ['instance_admin', 'assessments', 'assessment', 'assessment_instance'],
      activeSubPage: 'assessments',
      subPageRequiredFor: ['instance_admin'],
      urlSuffix: '/instance_admin/assessments',
      iconClasses: 'fa fa-list',
      tabLabel: 'Assessments',
    },
    {
      activePage: 'instance_admin',
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: '/instance_admin/file_view',
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
    },
    {
      activePage: 'gradebook',
      activeSubPage: 'gradebook',
      urlSuffix: '/instance_admin/gradebook',
      iconClasses: 'fas fa-balance-scale',
      tabLabel: 'Gradebook',
      renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
    },
    {
      activePage: 'instance_admin',
      activeSubPage: 'lti',
      urlSuffix: '/instance_admin/lti',
      iconClasses: 'fas fa-graduation-cap',
      tabLabel: 'LTI',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
    },
    {
      activePage: 'instance_admin',
      activeSubPage: 'lti13',
      urlSuffix: '/instance_admin/lti13_instance',
      iconClasses: 'fas fa-school-flag',
      tabLabel: 'LTI 1.3',
      renderCondition: (resLocals) => resLocals.lti13_enabled,
    },
    {
      activePage: 'instance_admin',
      activeSubPage: 'billing',
      urlSuffix: '/instance_admin/billing',
      iconClasses: 'fas fa-credit-card',
      tabLabel: 'Billing',
      renderCondition: (resLocals) => resLocals.billing_enabled,
    },
    {
      activePage: 'instance_admin',
      activeSubPage: 'settings',
      urlSuffix: '/instance_admin/settings',
      iconClasses: 'fas fa-cog',
      tabLabel: 'Settings',
    },
  ],
  course_admin: [
    {
      activePage: 'course_admin',
      activeSubPage: 'getting_started',
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
      activePage: 'course_admin',
      activeSubPage: 'instances',
      urlSuffix: '/course_admin/instances',
      iconClasses: 'fas fa-chalkboard-teacher',
      tabLabel: 'Course Instances',
    },
    {
      activePage: 'course_admin',
      activeSubPage: 'questions',
      urlSuffix: '/course_admin/questions',
      iconClasses: 'fa fa-question',
      tabLabel: 'Questions',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_preview,
    },
    {
      activePage: 'course_admin',
      activeSubPage: 'issues',
      urlSuffix: '/course_admin/issues',
      iconClasses: 'fas fa-bug',
      tabLabel: 'Issues',
    },
    {
      activePage: 'course_admin',
      activeSubPage: 'sharing',
      urlSuffix: '/course_admin/sharing',
      iconClasses: 'fas fa-share-nodes',
      tabLabel: 'Sharing',
      renderCondition: (resLocals) => resLocals.question_sharing_enabled,
    },
    {
      activePage: 'course_admin',
      activeSubPage: 'syncs',
      urlSuffix: '/course_admin/syncs',
      iconClasses: 'fas fa-sync-alt',
      tabLabel: 'Sync',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
    },

    {
      activePage: 'course_admin',
      activeSubPage: ['file_view', 'file_edit'],
      urlSuffix: '/course_admin/file_view',
      iconClasses: 'fa fa-edit',
      tabLabel: 'Files',
      renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
    },
    {
      activePage: 'course_admin',
      activeSubPage: 'settings',
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

  // TODO: better way to do `${course.id}` === `${c.id}`?
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
          ${resLocals.courses.map((c) => {
            return html`
              <a
                class="dropdown-item ${`${resLocals.course.id}` === `${c.id}` ? 'active' : ''}"
                href="/pl/course/${c.id}/course_admin"
              >
                ${c.short_name}
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
  // ${SideNavLink({
  //   text: 'Assessments',
  //   href: `${courseInstanceUrl}/assessments`,
  //   icon: 'fa-list',
  //   navPage: ['instance_admin', 'assessment', 'assessment_instance', 'assessments'], // TODO: is this comprehensive?
  //   activePage: page,
  //   navSubPage: 'assessments', // TODO: Lots of repeat code, can this be cleaned up?
  //   activeSubPage: subPage,
  // })}
  // ${SideNavLink({
  //   text: 'Gradebook',
  //   href: `${courseInstanceUrl}/gradebook`,
  //   icon: 'fa-scale-balanced',
  //   navPage: 'gradebook',
  //   activePage: page,
  //   navSubPage: 'gradebook',
  //   activeSubPage: subPage,
  // })}
  // ${SideNavLink({
  //   text: 'Files',
  //   href: `${courseInstanceUrl}/file_view`,
  //   icon: 'fa-edit',
  //   navPage: 'instance_admin',
  //   activePage: page,
  //   navSubPage: 'file_view',
  //   activeSubPage: subPage,
  // })}
  // ${SideNavLink({
  //   text: 'Settings',
  //   href: `${courseInstanceUrl}/settings`,
  //   icon: 'fa-gear',
  //   navPage: 'instance_admin',
  //   activePage: page,
  //   navSubPage: 'settings',
  //   activeSubPage: subPage,
  // })}
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
  tabInfo: TabInfo;
}) {
  const { urlPrefix } = resLocals;
  const {
    activePage,
    activeSubPage,
    subPageRequiredFor,
    iconClasses,
    tabLabel,
    htmlSuffix,
    renderCondition,
  } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  // TODO: Clean this up
  let isActive =
    navPage === activePage ||
    (Array.isArray(activePage) && navPage != null && activePage.includes(navPage));

  if (!subPageRequiredFor || subPageRequiredFor.includes(navPage)) {
    isActive =
      isActive &&
      (navSubPage === activeSubPage ||
        (Array.isArray(activeSubPage) && navSubPage != null && activeSubPage.includes(navSubPage)));
  }

  // const active = false; // TODO: implement
  // if (!Array.isArray(navPage)) {
  //   active = navPage === activePage && navSubPage === activeSubPage;
  // } else {
  //   active = navPage.includes(activePage);
  // }
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

// return html`
// <a href="${href}" class="side-nav-link ${active ? 'side-nav-link-active' : ''}"
//   ><i class="fa fa-fw ${iconClasses}"></i> ${text}</a
// >
// `;
