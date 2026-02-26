import { type FlashMessageType, flash } from '@prairielearn/flash';
import { type HtmlValue, html, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { config } from '../lib/config.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';
import type { Override } from '../middlewares/authzCourseOrInstance.js';

import { IssueBadgeHtml } from './IssueBadge.js';
import type { NavPage, NavSubPage, NavbarType } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.js';
import { ProgressCircle } from './ProgressCircle.js';

export function Navbar({
  resLocals,
  navPage,
  navSubPage,
  navbarType,
  marginBottom = true,
  isInPageLayout = false,
  sideNavEnabled = false,
}: {
  resLocals: UntypedResLocals;
  navPage?: NavPage;
  navSubPage?: NavSubPage;
  navbarType?: NavbarType;
  marginBottom?: boolean;
  /**
   * Indicates if the Navbar component is used within the PageLayout component.
   * Used to ensure that enhanced navigation features are only present on pages that use PageLayout.
   */
  isInPageLayout?: boolean;
  /**
   * Indicates if the side nav is enabled for the current page.
   */
  sideNavEnabled?: boolean;
}) {
  const { __csrf_token, course } = resLocals;
  navPage ??= resLocals.navPage;
  navSubPage ??= resLocals.navSubPage;
  navbarType ??= resLocals.navbarType;

  return html`
    ${config.devMode && __csrf_token
      ? // Unit tests often need access to the CSRF token even when the page contains
        // no form - for example, to confirm that a POST with a prohibited
        // action is denied. For convenience, we include the CSRF token here, on
        // all pages. We do this only in devMode and only for the purpose of
        // testing.
        html`
          <!-- DO NOT RELY ON OR USE THIS CSRF TOKEN FOR ANYTHING OTHER THAN UNIT TESTS! -->
          <span id="test_csrf_token" hidden>${__csrf_token}</span>
        `
      : ''}

    <nav
      class="container-fluid bg-primary visually-hidden-focusable"
      aria-label="Skip link and accessibility guide"
    >
      <a href="#content" class="d-inline-flex p-2 m-2 text-white">Skip to main content</a>
      <a
        href="https://docs.prairielearn.com/student-guide/accessibility/"
        class="d-inline-flex p-2 m-2 text-white"
      >
        Accessibility guide
      </a>
    </nav>

    ${config.announcementHtml
      ? html`
          <div
            class="alert alert-${config.announcementColor ?? 'primary'} mb-0 rounded-0 text-center"
          >
            ${unsafeHtml(config.announcementHtml)}
          </div>
        `
      : ''}

    <nav class="navbar navbar-dark bg-dark navbar-expand-md" aria-label="Global navigation">
      <div class="container-fluid position-relative">
        ${sideNavEnabled
          ? html`
              <button
                id="side-nav-mobile-toggler"
                class="navbar-toggler"
                type="button"
                aria-expanded="false"
                aria-label="Toggle side nav"
              >
                <span class="navbar-toggler-icon"></span>
              </button>
            `
          : ''}
        <a class="navbar-brand" href="/" aria-label="Homepage">
          <span class="navbar-brand-label">PrairieLearn</span>
          <span class="navbar-brand-hover-label">
            Go home <i class="fa fa-angle-right" aria-hidden="true"></i>
          </span>
        </a>
        <button
          id="course-nav-toggler"
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#course-nav"
          data-bs-animation="false"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="${sideNavEnabled ? 'bi bi-person-circle' : 'navbar-toggler-icon'}"></span>
        </button>
        <div id="course-nav" class="collapse navbar-collapse mobile-collapsed">
          <ul class="nav navbar-nav me-auto" id="main-nav">
            ${NavbarByType({
              resLocals,
              navPage,
              navSubPage,
              navbarType,
              isInPageLayout,
            })}
          </ul>

          ${config.devMode
            ? html`
                <a
                  id="navbar-load-from-disk"
                  class="btn btn-success btn-sm"
                  href="/pl/loadFromDisk"
                >
                  Load from disk
                </a>
              `
            : ''}
          ${UserDropdownMenu({ resLocals, navPage, navbarType })}
        </div>
      </div>
    </nav>

    ${navbarType === 'instructor' && course?.announcement_html && course.announcement_color
      ? html`
          <div class="alert alert-${course.announcement_color} mb-0 rounded-0 text-center">
            ${unsafeHtml(course.announcement_html)}
          </div>
        `
      : ''}
    ${isInPageLayout
      ? FlashMessages()
      : html`
          <div class="${marginBottom ? 'mb-3' : ''}">
            ${ContextNavigation({ resLocals, navPage, navSubPage })} ${FlashMessages()}
          </div>
        `}
  `;
}

function NavbarByType({
  resLocals,
  navPage,
  navSubPage,
  navbarType,
  isInPageLayout,
}: {
  resLocals: UntypedResLocals;
  navPage: NavPage;
  navSubPage: NavSubPage;
  navbarType: NavbarType;
  isInPageLayout?: boolean;
}) {
  // Student and public navbars remain unchanged
  // when enhanced navigation is enabled.
  if (navbarType === 'student') {
    return NavbarStudent({ resLocals, navPage });
  } else if (navbarType === 'public') {
    return NavbarPublic({ resLocals });
  } else {
    if (isInPageLayout) {
      return NavbarButtons({
        resLocals,
        navPage,
        navbarType,
      });
    } else if (navbarType === 'instructor') {
      // TODO: Remove this once `instructorAiGenerateDraftEditor.html.tsx` uses PageLayout.
      return NavbarInstructor({ resLocals, navPage, navSubPage });
    } else {
      // The only page that isn't in a PageLayout and hit by other checks
      // is `instructorAiGenerateDraftEditor.html.tsx`, which has navbarType `instructor`.
      throw new Error(`Invalid navbar type: ${navbarType}`);
    }
  }
}

function UserDropdownMenu({
  resLocals,
  navPage,
  navbarType,
}: {
  resLocals: UntypedResLocals;
  navPage: NavPage;
  navbarType: NavbarType;
}) {
  const {
    authz_data,
    authn_user,
    viewType,
    course_instance,
    access_as_administrator,
    authn_is_administrator,
  } = resLocals;

  let displayedName: HtmlValue;
  if (authz_data) {
    displayedName = run(() => {
      const name = authz_data.user.name || authz_data.user.uid;
      if (authz_data.mode != null && authz_data.mode !== 'Public') {
        return `${name} (${authz_data.mode})`;
      }
      return name;
    });
  } else if (authn_user) {
    displayedName = authn_user.name || authn_user.uid;
  } else {
    displayedName = '(no user)';
  }

  if (
    navbarType === 'student' &&
    course_instance &&
    (authz_data?.authn_has_course_permission_preview ||
      authz_data?.authn_has_course_instance_permission_view)
  ) {
    displayedName = html`${displayedName} <span class="badge text-bg-warning">student</span>`;
  } else if (authz_data?.overrides?.length > 0) {
    displayedName = html`${displayedName} <span class="badge text-bg-warning">modified</span>`;
  } else if (navbarType === 'instructor') {
    displayedName = html`${displayedName} <span class="badge text-bg-success">staff</span>`;
  }

  return html`
    <ul
      class="nav navbar-nav"
      id="username-nav"
      data-access-as-administrator="${access_as_administrator?.toString()}"
      data-view-type="${viewType ?? null}"
      data-authn-course-role="${authz_data?.authn_course_role}"
      data-authn-course-instance-role="${authz_data?.authn_course_instance_role}"
      data-has-instructor-access="${authz_data?.user_with_requested_uid_has_instructor_access_to_course_instance?.toString()}"
    >
      <li class="nav-item dropdown mb-2 mb-md-0 ${navPage === 'effective' ? 'active' : ''}">
        <a
          class="nav-link dropdown-toggle"
          id="navbarDropdown"
          href="#"
          role="button"
          data-bs-auto-close="outside"
          data-bs-toggle="dropdown"
          aria-haspopup="true"
          aria-expanded="false"
        >
          ${displayedName}
        </a>
        <div class="dropdown-menu dropdown-menu-end">
          ${authn_is_administrator
            ? html`
                <button type="button" class="dropdown-item" id="navbar-administrator-toggle">
                  ${access_as_administrator
                    ? 'Turn off administrator access'
                    : 'Turn on administrator access'}
                </button>

                <div class="dropdown-divider"></div>
              `
            : ''}
          ${ViewTypeMenu({ resLocals })} ${AuthnOverrides({ resLocals, navbarType })}
          ${authz_data?.mode === 'Exam'
            ? html`
                <div class="dropdown-item-text">
                  Exam mode means you have a checked-in reservation on PrairieTest. Your
                  interactions with PrairieLearn are limited to your checked-in exam for the
                  duration of your reservation.
                </div>
                <div class="dropdown-divider"></div>
              `
            : ''}
          ${!authz_data || authz_data?.mode === 'Public'
            ? html`<a class="dropdown-item" href="/pl/request_course">Course Requests</a>`
            : ''}
          <a class="dropdown-item" href="/pl/settings">Settings</a>
          <a class="dropdown-item" href="/pl/logout">Log out</a>
        </div>
      </li>
    </ul>
  `;
}

function FlashMessages() {
  const globalFlashColors = {
    notice: 'info',
    success: 'success',
    warning: 'warning',
    error: 'danger',
  } as const;

  // We might fail to fetch flash messages if this ends up running before the
  // flash middleware has run for this particular request. In that case, we
  // just assume that there are no flash messages.
  const flashMessages = run(() => {
    try {
      return flash(Object.keys(globalFlashColors) as FlashMessageType[]);
    } catch {
      return [];
    }
  });

  return flashMessages.map(
    ({ type, message }) => html`
      <div
        class="alert alert-${globalFlashColors[
          type
        ]} border-start-0 border-end-0 rounded-0 mt-0 mb-0 alert-dismissible fade show"
        role="alert"
      >
        ${unsafeHtml(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `,
  );
}

function ViewTypeMenu({ resLocals }: { resLocals: UntypedResLocals }) {
  const {
    viewType,
    course,
    course_instance,
    authz_data,
    assessment,
    question,
    assessment_instance,
    urlPrefix,
  } = resLocals;

  // If we're working with an example course, only allow changing the effective
  // user if the authenticated user is an administrator or we are in development mode.
  if (course?.example_course && !config.devMode && !authz_data?.authn_is_administrator) {
    return '';
  }

  // Only show "View type" menu(s) if the following two things are true:
  // - The authn user was given access to a course instance (so, both viewType and authz_data also exist).
  // - In particular, the authn user has instructor access to this course instance.
  if (
    viewType == null ||
    !course_instance ||
    !(
      authz_data.authn_has_course_permission_preview ||
      authz_data.authn_has_course_instance_permission_view
    )
  ) {
    return '';
  }

  // Note that the effective user may still have been denied access. In this
  // case, urlPrefix may not be consistent with the page that the effective user
  // was trying to access (instead, it will be consistent with a "plain" page).
  // So, to be safe, we use config.urlPrefix and construct all full URLs by hand.
  let instructorLink = '#';
  let studentLink = '#';
  if (viewType === 'instructor') {
    if (assessment?.id) {
      studentLink = `/pl/course_instance/${course_instance.id}/assessment/${assessment.id}`;
    } else {
      studentLink = `/pl/course_instance/${course_instance.id}/assessments`;
    }
  } else {
    if (question?.id) {
      instructorLink = `${urlPrefix}/instructor/question/${question.id}`;
    } else if (assessment_instance?.assessment_id) {
      instructorLink = `${urlPrefix}/instructor/assessment/${assessment_instance.assessment_id}`;
    } else if (assessment?.id) {
      instructorLink = `${urlPrefix}/instructor/assessment/${assessment.id}`;
    } else {
      instructorLink = `${urlPrefix}/instructor/instance_admin`;
    }
  }

  let headingAuthnViewTypeMenu = 'View type';
  if (authz_data.authn_user.uid !== authz_data.user.uid) {
    headingAuthnViewTypeMenu = 'View as';
    if (authz_data.authn_user.name) {
      headingAuthnViewTypeMenu += ` ${authz_data.authn_user.name} (${authz_data.authn_user.uid})`;
    } else {
      headingAuthnViewTypeMenu += ` ${authz_data.authn_user.uid}`;
    }
  }

  let authnViewTypeMenuChecked = '';
  if (authz_data.authn_user.uid === authz_data.user.uid) {
    if (viewType === 'instructor') {
      if (
        authz_data.has_course_permission_preview ||
        authz_data.has_course_instance_permission_view
      ) {
        authnViewTypeMenuChecked = 'instructor';
      }
    } else if (
      authz_data.has_course_permission_preview ||
      authz_data.has_course_instance_permission_view
    ) {
      authnViewTypeMenuChecked = 'student-no-rules';
    } else {
      authnViewTypeMenuChecked = 'student';
    }
  }

  let headingViewTypeMenu = '';
  let viewTypeMenuChecked = '';
  if (authz_data.authn_user.uid !== authz_data.user.uid) {
    headingViewTypeMenu = 'View as';
    if (authz_data.user.name) {
      headingViewTypeMenu += ` ${authz_data.user.name} (${authz_data.user.uid})`;
    } else {
      headingViewTypeMenu += ` ${authz_data.user.uid}`;
    }

    if (viewType === 'instructor') {
      if (
        authz_data.has_course_permission_preview ||
        authz_data.has_course_instance_permission_view
      ) {
        viewTypeMenuChecked = 'instructor';
      }
    } else if (
      authz_data.has_course_permission_preview ||
      authz_data.has_course_instance_permission_view
    ) {
      viewTypeMenuChecked = 'student-no-rules';
    } else {
      viewTypeMenuChecked = 'student';
    }
  }

  return html`
    ${authz_data?.overrides?.length > 0 && authnViewTypeMenuChecked === 'instructor'
      ? html`
          <a class="dropdown-item" href="${instructorLink}" id="navbar-reset-view">
            Reset to default staff view
            <span class="badge text-bg-success">staff</span>
          </a>

          <div class="dropdown-divider"></div>
        `
      : ''}

    <h6 class="dropdown-header">${headingAuthnViewTypeMenu}</h6>

    <a
      class="dropdown-item viewtype-dropdown-item"
      href="${instructorLink}"
      id="navbar-user-view-authn-instructor"
    >
      <span class="${authnViewTypeMenuChecked !== 'instructor' ? 'invisible' : ''}">&check;</span>
      <span class="ps-3">
        ${authz_data?.overrides?.length > 0 && authnViewTypeMenuChecked === 'instructor'
          ? 'Modified staff'
          : 'Staff'}
        view <span class="badge text-bg-success">staff</span>
      </span>
    </a>

    <a
      class="dropdown-item viewtype-dropdown-item"
      href="${studentLink}"
      id="navbar-user-view-authn-student"
    >
      <span class="${authnViewTypeMenuChecked !== 'student' ? 'invisible' : ''}">&check;</span>
      <span class="ps-3">Student view <span class="badge text-bg-warning">student</span></span>
    </a>

    <a
      class="dropdown-item viewtype-dropdown-item"
      href="${studentLink}"
      id="navbar-user-view-authn-student-no-rules"
    >
      <span class="${authnViewTypeMenuChecked !== 'student-no-rules' ? 'invisible' : ''}">
        &check;
      </span>
      <span class="ps-3">
        Student view without access restrictions
        <span class="badge text-bg-warning">student</span>
      </span>
    </a>

    ${authz_data.authn_user.uid !== authz_data.user.uid
      ? html`
          <div class="dropdown-divider"></div>
          <h6 class="dropdown-header">${headingViewTypeMenu}</h6>

          ${authz_data.user_with_requested_uid_has_instructor_access_to_course_instance
            ? html`
                <a class="dropdown-item" href="${instructorLink}" id="navbar-user-view-instructor">
                  <span class="${viewTypeMenuChecked !== 'instructor' ? 'invisible' : ''}">
                    &check;
                  </span>
                  <span class="ps-3">Staff view</span>
                </a>
              `
            : ''}

          <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-student">
            <span class="${viewTypeMenuChecked !== 'student' ? 'invisible' : ''}"> &check; </span>
            <span class="ps-3">Student view</span>
          </a>

          <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-student-no-rules">
            <span class="${viewTypeMenuChecked !== 'student-no-rules' ? 'invisible' : ''}">
              &check;
            </span>
            <span class="ps-3">Student view without access restrictions</span>
          </a>
        `
      : ''}

    <div class="dropdown-divider"></div>
  `;
}

function AuthnOverrides({
  resLocals,
  navbarType,
}: {
  resLocals: UntypedResLocals;
  navbarType: NavbarType;
}) {
  const { authz_data, urlPrefix, course, course_instance } = resLocals;

  // If we're working with an example course, only allow changing the effective
  // user if the authenticated user is an administrator or we are in development mode.
  if (course?.example_course && !config.devMode && !authz_data?.authn_is_administrator) {
    return '';
  }

  if (
    !authz_data?.authn_has_course_permission_preview &&
    !authz_data?.authn_has_course_instance_permission_view
  ) {
    return '';
  }

  let effectiveUserUrl = `${urlPrefix}/effectiveUser`;
  if (navbarType !== 'student' && navbarType !== 'instructor') {
    // The only way for authz_data to exist, for authn_has_course_permission_preview to be true,
    // and for navbarType to be neither student nor instructor, is if we are in a course or course
    // instance and if the effective user does not have access.
    //
    // In this case, we still want a link to the "Change effective user" page, but we need to
    // construct this link from scratch, because urlPrefix corresponds neither to the student
    // page route nor the instructor page route (it gets set after successful authorization).
    //
    // It is ok to use the instructor route only to the effectiveUser page - this will redirect
    // to the student route if necessary.
    if (course_instance) {
      effectiveUserUrl = `/pl/course_instance/${course_instance.id}/instructor/effectiveUser`;
    } else {
      effectiveUserUrl = `/pl/course/${course.id}/effectiveUser`;
    }
  }

  return html`
    <h6 class="dropdown-header">Effective user</h6>

    <form class="dropdown-item-text d-flex flex-nowrap js-effective-uid-form">
      <input
        id="effective-uid"
        type="email"
        placeholder="student@example.com"
        class="form-control form-control-sm me-2 flex-grow-1 js-effective-uid-input"
        aria-label="UID"
      />
      <button
        type="submit"
        class="btn btn-primary btn-sm text-nowrap js-effective-uid-button"
        disabled
      >
        Change UID
      </button>
    </form>

    ${authz_data?.overrides?.length > 0
      ? html`
          <div class="dropdown-item-text">
            <div class="list-group small text-nowrap">
              ${authz_data.overrides.map(
                (override: Override) => html`
                  <div class="list-group-item list-group-item-warning small p-2">
                    <div class="d-flex flex-row justify-content-between align-items-center">
                      <div class="p-0 me-4">
                        <ul class="list-unstyled">
                          <li class="fw-bold">${override.name}</li>
                          <li>${override.value}</li>
                        </ul>
                      </div>
                      <div>
                        <button
                          class="btn btn-xs btn-warning js-remove-override"
                          type="button"
                          data-override-cookie="${override.cookie}"
                        >
                          <i class="fas fa-times me-1"></i>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                `,
              )}
            </div>
          </div>
        `
      : ''}

    <a class="dropdown-item" href="${effectiveUserUrl}">Customize&hellip;</a>

    <div class="dropdown-divider"></div>
  `;
}

function NavbarButton({
  text,
  href,
  active = false,
  showArrow = true,
}: {
  text: string;
  href: string;
  active?: boolean;
  showArrow?: boolean;
}) {
  return html`
    <li class="nav-item">
      <a class="nav-link ${active ? 'active' : ''}" href="${href}">${text}</a>
    </li>
    ${showArrow
      ? html`<li class="nav-item d-none d-lg-block" aria-hidden="true">
          <span class="nav-link disabled px-0" style="color: var(--bs-nav-link-color);">
            &rarr;
          </span>
        </li>`
      : ''}
  `;
}

function NavbarButtons({
  resLocals,
  navPage,
  navbarType,
}: {
  resLocals: UntypedResLocals;
  navPage: NavPage;
  navbarType: NavbarType;
}) {
  // When no institution or course is set, show links to the home page and the global admin page.
  if (
    !resLocals.institution &&
    !resLocals.course &&
    navPage !== 'admin' &&
    navbarType === 'plain'
  ) {
    return html`
      ${NavbarButton({
        text: 'Home',
        href: '/',
        showArrow: false,
      })}
      ${resLocals.is_administrator
        ? NavbarButton({
            text: 'Global Admin',
            href: '/pl/administrator/admins',
            showArrow: false,
          })
        : ''}
    `;
  }

  const allNavbarButtons = [{ text: 'Home', href: '/' }];

  if (resLocals.is_administrator) {
    allNavbarButtons.push({ text: 'Global Admin', href: '/pl/administrator/admins' });
  }

  if (resLocals.institution) {
    if (resLocals.is_administrator) {
      allNavbarButtons.push(
        { text: 'Institutions', href: '/pl/administrator/institutions' },
        {
          text: resLocals.institution.short_name,
          href: `/pl/administrator/institution/${resLocals.institution.id}`,
        },
      );
    } else if (resLocals.is_institution_administrator) {
      allNavbarButtons.push({
        text: resLocals.institution.short_name,
        href: `/pl/institution/${resLocals.institution.id}/admin/admins`,
      });
    }
  }

  if (resLocals.course) {
    if (resLocals.institution) {
      if (resLocals.is_administrator) {
        allNavbarButtons.push({
          text: 'Courses',
          href: `/pl/administrator/institution/${resLocals.institution.id}/courses`,
        });
      } else if (resLocals.is_institution_administrator) {
        allNavbarButtons.push({
          text: 'Courses',
          href: `/pl/institution/${resLocals.institution.id}/admin/courses`,
        });
      }
    }
    allNavbarButtons.push({
      text: resLocals.course.short_name,
      href: `/pl/course/${resLocals.course.id}/course_admin/instances`,
    });
  }

  if (resLocals.course_instance) {
    allNavbarButtons.push({
      text: resLocals.course_instance.short_name,
      href: `/pl/course_instance/${resLocals.course_instance.id}/instructor/instance_admin/assessments`,
    });
  }

  return html`
    ${allNavbarButtons.map((navbarButton, index) =>
      NavbarButton({
        text: navbarButton.text,
        href: navbarButton.href,
        showArrow: index < allNavbarButtons.length - 1,
        active: index === allNavbarButtons.length - 1,
      }),
    )}
  `;
}

function NavbarStudent({ resLocals, navPage }: { resLocals: UntypedResLocals; navPage: NavPage }) {
  const { course, course_instance, assessment_instance, assessment_instance_label, urlPrefix } =
    resLocals;

  return html`
    <li class="nav-item navbar-text me-4">
      ${course?.short_name ?? ''}, ${course_instance?.short_name ?? ''}
    </li>

    <li class="nav-item ${navPage === 'assessments' ? 'active' : ''}">
      <a class="nav-link" href="${urlPrefix}/assessments">Assessments</a>
    </li>
    <li class="nav-item ${navPage === 'gradebook' ? 'active' : ''}">
      <a class="nav-link" href="${urlPrefix}/gradebook">Gradebook</a>
    </li>

    ${assessment_instance_label != null && assessment_instance != null
      ? html`
          <li class="nav-item ${navPage === 'assessment_instance' ? 'active' : ''}">
            <a class="nav-link" href="${urlPrefix}/assessment_instance/${assessment_instance.id}">
              ${assessment_instance_label}
            </a>
          </li>
        `
      : ''}
  `;
}

function NavbarInstructor({
  resLocals,
  navPage,
  navSubPage,
}: {
  resLocals: UntypedResLocals;
  navPage: NavPage;
  navSubPage?: NavSubPage;
}) {
  const {
    course,
    course_instance,
    navbarOpenIssueCount,
    navbarCompleteGettingStartedTasksCount,
    navbarTotalGettingStartedTasksCount,
    authz_data,
    urlPrefix,
  } = resLocals;
  return html`
    <li class="nav-item btn-group" id="navbar-course-switcher">
      <a
        class="nav-link ${navPage === 'course_admin' &&
        !(navSubPage === 'issues' || navSubPage === 'questions' || navSubPage === 'syncs')
          ? 'active'
          : ''} ${!authz_data.has_course_permission_view ? 'disabled' : ''}"
        href="${urlPrefix}/course_admin"
      >
        ${course.short_name}
      </a>
      <a
        class="nav-link dropdown-toggle dropdown-toggle-split"
        id="navbarDropdownMenuCourseAdminLink"
        href="#"
        role="button"
        data-bs-toggle="dropdown"
        aria-label="Change course"
        aria-haspopup="true"
        aria-expanded="false"
        hx-get="/pl/navbar/course/${course.id}/switcher"
        hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
        hx-target="#navbarDropdownMenuCourseAdmin"
      ></a>
      <div
        class="dropdown-menu"
        aria-labelledby="navbarDropdownMenuCourseAdminLink"
        id="navbarDropdownMenuCourseAdmin"
      >
        <div class="d-flex justify-content-center">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading courses...</span>
          </div>
        </div>
      </div>
    </li>

    ${authz_data.has_course_permission_edit && course.show_getting_started
      ? html`
          <li class="nav-item d-flex align-items-center">
            <a
              style="display: inline-flex; align-items: center;"
              class="nav-link pe-0"
              href="${urlPrefix}/course_admin/getting_started"
            >
              Getting Started
              ${ProgressCircle({
                value: navbarCompleteGettingStartedTasksCount,
                maxValue: navbarTotalGettingStartedTasksCount,
                className: 'mx-1',
              })}
            </a>
          </li>
        `
      : ''}

    <li class="nav-item ${navPage === 'course_admin' && navSubPage === 'issues' ? 'active' : ''}">
      <a class="nav-link" href="${urlPrefix}/course_admin/issues">
        Issues ${IssueBadgeHtml({ count: navbarOpenIssueCount, suppressLink: true })}
      </a>
    </li>
    ${authz_data.has_course_permission_preview
      ? html`
          <li
            class="nav-item ${navPage === 'course_admin' && navSubPage === 'questions'
              ? 'active'
              : ''}"
          >
            <a class="nav-link" href="${urlPrefix}/course_admin/questions">Questions</a>
          </li>
        `
      : ''}
    ${authz_data.has_course_permission_edit
      ? html`
          <li
            class="nav-item ${navPage === 'course_admin' && navSubPage === 'syncs' ? 'active' : ''}"
          >
            <a class="nav-link" href="${urlPrefix}/course_admin/syncs">Sync</a>
          </li>
        `
      : ''}
    ${course_instance
      ? html`
          <li class="navbar-text mx-2 no-select">/</li>
          <li class="nav-item btn-group" id="navbar-course-instance-switcher">
            <a
              class="nav-link ${navPage === 'instance_admin' &&
              !(navSubPage === 'assessments' || navSubPage === 'gradebook')
                ? 'active'
                : ''}"
              href="/pl/course_instance/${course_instance.id}/instructor/instance_admin"
            >
              ${course_instance.short_name}
            </a>
            <a
              class="nav-link dropdown-toggle dropdown-toggle-split"
              id="navbarDropdownMenuInstanceAdminLink"
              href="#"
              role="button"
              data-bs-toggle="dropdown"
              aria-label="Change course instance"
              aria-haspopup="true"
              aria-expanded="false"
              hx-get="/pl/navbar/course/${course.id}/course_instance_switcher/${course_instance.id}"
              hx-trigger="show.bs.dropdown once delay:200ms"
              hx-target="#navbarDropdownMenuInstanceAdmin"
            ></a>
            <div
              class="dropdown-menu"
              aria-labelledby="navbarDropdownMenuInstanceAdminLink"
              id="navbarDropdownMenuInstanceAdmin"
            >
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="visually-hidden">Loading course instances...</span>
                </div>
              </div>
            </div>
          </li>

          <li
            class="nav-item ${navPage === 'instance_admin' && navSubPage === 'assessments'
              ? 'active'
              : ''}"
          >
            <a class="nav-link" href="${urlPrefix}/instance_admin/assessments">Assessments</a>
          </li>

          <li
            class="nav-item ${navPage === 'instance_admin' && navSubPage === 'gradebook'
              ? 'active'
              : ''}"
          >
            <a class="nav-link" href="${urlPrefix}/instance_admin/gradebook">Gradebook</a>
          </li>
        `
      : html`
          <li class="navbar-text mx-2 no-select">/</li>

          <li class="nav-item dropdown" id="navbar-course-instance-switcher">
            <a
              class="nav-link dropdown-toggle"
              id="navbarDropdownMenuInstanceChooseLink"
              href="#"
              role="button"
              data-bs-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
              hx-get="/pl/navbar/course/${course.id}/course_instance_switcher"
              hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
              hx-target="#navbarDropdownMenuInstanceChoose"
            >
              Choose course instance...
            </a>
            <div
              class="dropdown-menu"
              aria-labelledby="navbarDropdownMenuInstanceChooseLink"
              id="navbarDropdownMenuInstanceChoose"
            >
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="visually-hidden">Loading course instances...</span>
                </div>
              </div>
            </div>
          </li>
        `}
  `;
}

function NavbarPublic({ resLocals }: { resLocals: UntypedResLocals }) {
  const { course } = resLocals;
  return html`
    <li class="nav-item btn-group">
      <a
        class="nav-link"
        aria-label="Link to page showing all public questions for the course."
        href="/pl/public/course/${course?.id}/questions"
      >
        ${course?.short_name ?? ''}
      </a>
    </li>
  `;
}
