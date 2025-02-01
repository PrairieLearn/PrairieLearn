import { html } from '@prairielearn/html';

import type { Course, CourseInstance } from '../lib/db-types.js';

import type { NavPage, NavSubPage } from './Navbar.types.js';

export function SideNav({
  course,
  courseInstance,
  page,
  subPage,
}: {
  course: Course;
  courseInstance?: CourseInstance;
  page: NavPage;
  subPage: NavSubPage;
}) {
  return html`
    <div class="side-nav">
      ${CourseNav({
        course,
        page,
        subPage,
      })}
      ${courseInstance
        ? CourseInstanceNav({
            courseInstance,
            page,
            subPage,
          })
        : ''}
    </div>
  `;
}

function CourseNav({
  course,
  page,
  subPage,
}: {
  course: Course;
  page: NavPage;
  subPage: NavSubPage;
}) {
  const courseAdminUrl = `/pl/course/${course.id}/course_admin`;
  return html`
    <div class="side-nav-section-header">Course</div>
    <div class="side-nav-group mb-3">
      <div>
        <select id="course-picker" class="form-select" aria-label="Course">
          <option selected>TAM 212</option>
          <option>Other course</option>
        </select>
      </div>
      ${SideNavLink({
        text: 'Course instances',
        href: `${courseAdminUrl}/instances`,
        icon: 'fa-chalkboard-user',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'instances',
        activeSubPage: subPage,
      })}
      ${SideNavLink({
        text: 'Questions',
        href: `${courseAdminUrl}/questions`,
        icon: 'fa-question',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'questions',
        activeSubPage: subPage,
      })}
      ${SideNavLink({
        text: 'Issues',
        href: `${courseAdminUrl}/issues`,
        icon: 'fa-bug',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'issues',
        activeSubPage: subPage,
      })}
      ${SideNavLink({
        text: 'Sync',
        href: `${courseAdminUrl}/syncs`,
        icon: 'fa-sync',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'syncs',
        activeSubPage: subPage,
      })}
      ${SideNavLink({
        text: 'Files',
        href: `${courseAdminUrl}/file_view`,
        icon: 'fa-edit',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'file_view',
        activeSubPage: subPage,
      })}
      ${SideNavLink({
        text: 'Settings',
        href: `${courseAdminUrl}/settings`,
        icon: 'fa-gear',
        navPage: 'course_admin',
        activePage: page,
        navSubPage: 'settings',
        activeSubPage: subPage,
      })}
    </div>
  `;
}

function CourseInstanceNav({
  courseInstance,
  page,
  subPage,
}: {
  courseInstance: CourseInstance;
  page: NavPage;
  subPage: NavSubPage;
}) {
  const courseInstanceUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin`;

  return html`
    <div class="side-nav-section-header">Course instance</div>
    <div class="side-nav-group mb-3">
      <div>
        <select id="course-instance-picker" class="form-select" aria-label="Course instance">
          <option selected>Fall 2024</option>
          <option>Spring 2024</option>
        </select>
        ${SideNavLink({
          text: 'Assessments',
          href: `${courseInstanceUrl}/assessments`,
          icon: 'fa-list',
          navPage: 'instance_admin',
          activePage: page,
          navSubPage: 'assessments', // TODO: Lots of repeat code, can this be cleaned up?
          activeSubPage: subPage,
        })}
        ${SideNavLink({
          text: 'Gradebook',
          href: `${courseInstanceUrl}/gradebook`,
          icon: 'fa-scale-balanced',
          navPage: 'gradebook',
          activePage: page,
          navSubPage: 'gradebook',
          activeSubPage: subPage,
        })}
        ${SideNavLink({
          text: 'Files',
          href: `${courseInstanceUrl}/file_view`,
          icon: 'fa-edit',
          navPage: 'instance_admin',
          activePage: page,
          navSubPage: 'file_view',
          activeSubPage: subPage,
        })}
        ${SideNavLink({
          text: 'Settings',
          href: `${courseInstanceUrl}/settings`,
          icon: 'fa-gear',
          navPage: 'instance_admin',
          activePage: page,
          navSubPage: 'settings',
          activeSubPage: subPage,
        })}
      </div>
    </div>
  `;
}

function SideNavLink({
  text,
  href,
  icon,
  navPage,
  activePage,
  navSubPage,
  activeSubPage,
}: {
  text: string; // TODO: Document
  href: string;
  icon: string;
  navPage: NavPage;
  activePage: NavPage;
  navSubPage?: NavSubPage;
  activeSubPage?: NavSubPage;
}) {
  const active = navPage === activePage && navSubPage === activeSubPage;
  return html`
    <a href="${href}" class="side-nav-link ${active ? 'side-nav-link-active' : ''}"
      ><i class="fa fa-fw ${icon}"></i> ${text}</a
    >
  `;
}
