import { flash, type FlashMessageType } from '@prairielearn/flash';
import { html, type HtmlValue, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { config } from '../lib/config.js';

import { IssueBadge } from './IssueBadge.html.js';
import type { NavbarType, NavPage, NavSubPage } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.html.js';

export function Navbar({
  resLocals,
  navPage,
  navSubPage,
  navbarType,
}: {
  resLocals: Record<string, any>;
  navPage?: NavPage;
  navSubPage?: NavSubPage;
  navbarType?: NavbarType;
}) {
  const { __csrf_token, course, urlPrefix } = resLocals;
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

    <div class="container-fluid bg-primary">
      <a href="#content" class="sr-only sr-only-focusable d-inline-flex p-2 m-2 text-white">
        Skip to main content
      </a>
    </div>

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
      <div class="container-fluid">
        <a class="navbar-brand" href="${config.homeUrl}" aria-label="Homepage">
          <span class="navbar-brand-label">PrairieLearn</span>
          <span class="navbar-brand-hover-label">
            Go home <i class="fa fa-angle-right" aria-hidden="true"></i>
          </span>
        </a>
        <button
          class="navbar-toggler"
          type="button"
          data-toggle="collapse"
          data-target=".navbar-collapse"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div id="course-nav" class="collapse navbar-collapse">
          <ul class="nav navbar-nav mr-auto" id="main-nav">
            ${NavbarByType({ resLocals, navPage, navSubPage, navbarType })}
          </ul>

          ${config.devMode
            ? html`
                <a
                  id="navbar-load-from-disk"
                  class="btn btn-success btn-sm"
                  href="${urlPrefix}/loadFromDisk"
                >
                  Load from disk
                </a>
              `
            : ''}
          ${UserDropdownMenu({ resLocals, navPage, navbarType })}
        </div>
      </div>
    </nav>

    ${navbarType === 'instructor' && course && course.announcement_html && course.announcement_color
      ? html`
          <div class="alert alert-${course.announcement_color} mb-0 rounded-0 text-center">
            ${unsafeHtml(course.announcement_html)}
          </div>
        `
      : ''}
    ${ContextNavigation({ resLocals, navPage, navSubPage })} ${FlashMessages()}
  `;
}

function NavbarByType({
  resLocals,
  navPage,
  navSubPage,
  navbarType,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
  navSubPage: NavSubPage;
  navbarType: NavbarType;
}) {
  if (navbarType == null || navbarType === 'plain') {
    return NavbarPlain({ resLocals, navPage });
  } else if (navbarType === 'student') {
    return NavbarStudent({ resLocals, navPage });
  } else if (navbarType === 'instructor') {
    return NavbarInstructor({ resLocals, navPage, navSubPage });
  } else if (navbarType === 'administrator_institution') {
    return NavbarAdministratorInstitution({ resLocals });
  } else if (navbarType === 'institution') {
    return NavbarInstitution({ resLocals });
  } else if (navbarType === 'public') {
    return NavbarPublic({ resLocals });
  } else {
    throw new Error(`Unknown navbarType: ${navbarType}`);
  }
}

function UserDropdownMenu({
  resLocals,
  navPage,
  navbarType,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
  navbarType: NavbarType;
}) {
  const {
    authz_data,
    authn_user,
    viewType,
    course_instance,
    urlPrefix,
    access_as_administrator,
    news_item_notification_count: newsCount,
    authn_is_administrator,
  } = resLocals;

  let displayedName: HtmlValue;
  if (authz_data) {
    displayedName = authz_data.user.name || authz_data.user.uid;

    if (authz_data.mode != null && authz_data.mode !== 'Public') {
      displayedName += ` (${authz_data.mode})`;
    }
  } else if (authn_user) {
    displayedName = authn_user.name || authn_user.uid;
  } else {
    displayedName = '(no user)';
  }

  if (
    navbarType === 'student' &&
    course_instance &&
    (authz_data.authn_has_course_permission_preview ||
      authz_data.authn_has_course_instance_permission_view)
  ) {
    displayedName = html`${displayedName} <span class="badge badge-warning">student</span>`;
  } else if (authz_data?.overrides) {
    displayedName = html`${displayedName} <span class="badge badge-warning">modified</span>`;
  } else if (navbarType === 'instructor') {
    displayedName = html`${displayedName} <span class="badge badge-success">staff</span>`;
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
      <li class="nav-item dropdown mb-2 mb-md-0 mr-2 ${navPage === 'effective' ? 'active' : ''}">
        <button
          class="btn nav-link dropdown-toggle"
          id="navbarDropdown"
          type="button"
          data-toggle="dropdown"
          aria-haspopup="true"
          aria-expanded="false"
        >
          ${displayedName}
          ${newsCount
            ? html`<span class="badge badge-pill badge-primary news-item-count">${newsCount}</span>`
            : ''}
        </button>
        <div class="dropdown-menu dropdown-menu-right" aria-labelledby="navbarDropdown">
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
          ${!authz_data || authz_data?.mode !== 'Exam'
            ? html`
                <a class="dropdown-item" href="${config.urlPrefix}/request_course">
                  Course Requests
                </a>
              `
            : ''}
          <a class="dropdown-item" href="${config.urlPrefix}/settings">Settings</a>
          <a
            class="dropdown-item news-item-link"
            href="${urlPrefix}/news_items"
            title="News${newsCount ? ` (${newsCount} unread)` : ''}"
            aria-label="News${newsCount ? ` (${newsCount} unread)` : ''}"
          >
            News
            ${newsCount
              ? html`
                  <span class="badge badge-pill badge-primary news-item-link-count">
                    ${newsCount}
                  </span>
                `
              : ''}
          </a>

          <a class="dropdown-item" href="${config.urlPrefix}/logout">Log out</a>
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

  return html`
    <div class="mb-3">
      ${flashMessages.map(
        ({ type, message }) => html`
          <div
            class="alert alert-${globalFlashColors[
              type
            ]} border-left-0 border-right-0 rounded-0 mt-0 mb-0 alert-dismissible fade show"
            role="alert"
          >
            ${unsafeHtml(message)}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function ViewTypeMenu({ resLocals }: { resLocals: Record<string, any> }) {
  const {
    viewType,
    course_instance,
    authz_data,
    assessment,
    question,
    assessment_instance,
    urlPrefix,
  } = resLocals;

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
      studentLink = `${config.urlPrefix}/course_instance/${course_instance.id}/assessment/${assessment.id}`;
    } else {
      studentLink = `${config.urlPrefix}/course_instance/${course_instance.id}/assessments`;
    }
  } else {
    if (question?.id) {
      instructorLink = `${urlPrefix}/instructor/question/${question.id}`;
    } else if (assessment_instance?.assessment_id) {
      instructorLink = `${urlPrefix}/instructor/assessment/${assessment_instance.assessment_id}`;
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
    ${authz_data?.overrides && authnViewTypeMenuChecked === 'instructor'
      ? html`
          <a class="dropdown-item" href="${instructorLink}" id="navbar-reset-view">
            Reset to default staff view
            <span class="badge badge-success">staff</span>
          </a>

          <div class="dropdown-divider"></div>
        `
      : ''}

    <h6 class="dropdown-header">${headingAuthnViewTypeMenu}</h6>

    <a class="dropdown-item" href="${instructorLink}" id="navbar-user-view-authn-instructor">
      <span class="${authnViewTypeMenuChecked !== 'instructor' ? 'invisible' : ''}">&check;</span>
      <span class="pl-3">
        ${authz_data?.overrides && authnViewTypeMenuChecked === 'instructor'
          ? 'Modified staff'
          : 'Staff'}
        view <span class="badge badge-success">staff</span>
      </span>
    </a>

    <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-authn-student">
      <span class="${authnViewTypeMenuChecked !== 'student' ? 'invisible' : ''}">&check;</span>
      <span class="pl-3">Student view <span class="badge badge-warning">student</span></span>
    </a>

    <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-authn-student-no-rules">
      <span class="${authnViewTypeMenuChecked !== 'student-no-rules' ? 'invisible' : ''}">
        &check;
      </span>
      <span class="pl-3">
        Student view without access restrictions
        <span class="badge badge-warning">student</span>
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
                  <span class="pl-3">Staff view</span>
                </a>
              `
            : ''}

          <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-student">
            <span class="${viewTypeMenuChecked !== 'student' ? 'invisible' : ''}"> &check; </span>
            <span class="pl-3">Student view</span>
          </a>

          <a class="dropdown-item" href="${studentLink}" id="navbar-user-view-student-no-rules">
            <span class="${viewTypeMenuChecked !== 'student-no-rules' ? 'invisible' : ''}">
              &check;
            </span>
            <span class="pl-3">Student view without access restrictions</span>
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
  resLocals: Record<string, any>;
  navbarType: NavbarType;
}) {
  const { authz_data, urlPrefix, course_instance, course } = resLocals;
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
      effectiveUserUrl = `${config.urlPrefix}/course_instance/${course_instance.id}/instructor/effectiveUser`;
    } else {
      effectiveUserUrl = `${config.urlPrefix}/course/${course.id}/effectiveUser`;
    }
  }

  return html`
    <h6 class="dropdown-header">Effective user</h6>

    <form class="form-inline dropdown-item-text d-flex flex-nowrap js-effective-uid-form">
      <label class="sr-only" for="effective-uid">UID</label>
      <input
        id="effective-uid"
        type="email"
        placeholder="student@example.com"
        class="form-control form-control-sm mr-2 flex-grow-1 js-effective-uid-input"
      />
      <button
        type="submit"
        class="btn btn-primary btn-sm text-nowrap js-effective-uid-button"
        disabled
      >
        Change UID
      </button>
    </form>

    ${authz_data.overrides
      ? html`
          <div class="dropdown-item-text">
            <div class="list-group small text-nowrap">
              ${authz_data.overrides.map(
                (override) => html`
                  <div class="list-group-item list-group-item-warning small p-2">
                    <div class="d-flex flex-row justify-content-between align-items-center">
                      <div class="p-0 mr-4">
                        <ul class="list-unstyled">
                          <li class="font-weight-bold">${override.name}</li>
                          <li>${override.value}</li>
                        </ul>
                      </div>
                      <div>
                        <button
                          class="btn btn-xs btn-warning js-remove-override"
                          type="button"
                          data-override-cookie="${override.cookie}"
                        >
                          <i class="fas fa-times mr-1"></i>
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

function NavbarPlain({ resLocals, navPage }: { resLocals: Record<string, any>; navPage: NavPage }) {
  if (!resLocals.is_administrator) return '';
  return html`
    <li class="nav-item ${navPage === 'admin' ? 'active' : ''}">
      <a class="nav-link" href="${config.urlPrefix}/administrator/admins">Admin</a>
    </li>
  `;
}

function NavbarStudent({
  resLocals,
  navPage,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
}) {
  const { course, course_instance, assessment_instance, assessment_instance_label, urlPrefix } =
    resLocals;

  return html`
    <li class="nav-item navbar-text mr-4">
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
  resLocals: Record<string, any>;
  navPage: NavPage;
  navSubPage?: NavSubPage;
}) {
  const {
    course,
    course_instance,
    assessment,
    assessment_label,
    assessments,
    navbarOpenIssueCount,
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
      <button
        class="btn nav-link dropdown-toggle dropdown-toggle-split"
        id="navbarDropdownMenuCourseAdminLink"
        type="button"
        data-toggle="dropdown"
        aria-label="Change course"
        aria-haspopup="true"
        aria-expanded="false"
        ${!authz_data.overrides
          ? html`
              hx-get="/pl/navbar/course/${course.id}/switcher" hx-trigger="show-course-switcher once
              delay:200ms" hx-target="#navbarDropdownMenuCourseAdmin"
            `
          : ''}
      ></button>
      <div
        class="dropdown-menu"
        aria-labelledby="navbarDropdownMenuCourseAdminLink"
        id="navbarDropdownMenuCourseAdmin"
      >
        ${authz_data.overrides
          ? html`
              <span class="dropdown-item-text small"
                >Effective users may not switch between courses</span
              >
            `
          : html`
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="sr-only">Loading courses...</span>
                </div>
              </div>
            `}
      </div>
    </li>

    <li class="nav-item ${navPage === 'course_admin' && navSubPage === 'issues' ? 'active' : ''}">
      <a class="nav-link" href="${urlPrefix}/course_admin/issues">
        Issues ${IssueBadge({ count: navbarOpenIssueCount, suppressLink: true })}
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
              href="${config.urlPrefix}/course_instance/${course_instance.id}/instructor/instance_admin"
            >
              ${course_instance.short_name}
            </a>
            <button
              class="btn nav-link dropdown-toggle dropdown-toggle-split"
              id="navbarDropdownMenuInstanceAdminLink"
              type="button"
              data-toggle="dropdown"
              aria-label="Change course instance"
              aria-haspopup="true"
              aria-expanded="false"
              hx-get="/pl/navbar/course/${course.id}/course_instance_switcher/${course_instance.id}"
              hx-trigger="show-course-instance-switcher once delay:200ms"
              hx-target="#navbarDropdownMenuInstanceAdmin"
            ></button>
            <div
              class="dropdown-menu"
              aria-labelledby="navbarDropdownMenuInstanceAdminLink"
              id="navbarDropdownMenuInstanceAdmin"
            >
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="sr-only">Loading course instances...</span>
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

          ${assessment_label != null && assessment != null
            ? html`
                <li class="navbar-text mx-2 no-select">/</li>
                <li class="nav-item btn-group">
                  <a
                    class="nav-link ${navPage === 'assessment' ? 'active' : ''}"
                    href="${urlPrefix}/assessment/${assessment.id}"
                  >
                    ${assessment_label}
                  </a>
                  ${assessments != null
                    ? html`
                        <button
                          class="btn nav-link dropdown-toggle dropdown-toggle-split"
                          id="navbarDropdownMenuLink"
                          type="button"
                          data-toggle="dropdown"
                          aria-haspopup="true"
                          aria-expanded="false"
                          aria-label="Change assessment"
                        ></button>
                        <div
                          class="dropdown-menu"
                          aria-labelledby="navbarDropdownMenuLink"
                          id="navbarDropwdownMenuInstructorAssessment"
                        >
                          ${assessments.map(
                            (a) => html`
                              <a
                                class="dropdown-item ${navPage === 'assessment' &&
                                assessment.id === a.id
                                  ? 'active'
                                  : ''}"
                                href="${urlPrefix}/assessment/${a.id}${navPage === 'assessment' &&
                                navSubPage !== 'file_edit'
                                  ? `/${navSubPage}`
                                  : ''}"
                              >
                                ${a.assessment_label}
                              </a>
                            `,
                          )}
                        </div>
                      `
                    : ''}
                </li>
              `
            : ''}
        `
      : html`
          <li class="navbar-text mx-2 no-select">/</li>

          <li class="nav-item dropdown" id="navbar-course-instance-switcher">
            <button
              class="btn nav-link dropdown-toggle"
              id="navbarDropdownMenuInstanceChooseLink"
              type="button"
              data-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
              hx-get="/pl/navbar/course/${course.id}/course_instance_switcher"
              hx-trigger="show-course-instance-switcher once delay:200ms"
              hx-target="#navbarDropdownMenuInstanceChoose"
            >
              Choose course instance...
            </button>
            <div
              class="dropdown-menu"
              aria-labelledby="navbarDropdownMenuInstanceChooseLink"
              id="navbarDropdownMenuInstanceChoose"
            >
              <div class="d-flex justify-content-center">
                <div class="spinner-border spinner-border-sm" role="status">
                  <span class="sr-only">Loading course instances...</span>
                </div>
              </div>
            </div>
          </li>
        `}
  `;
}

function NavbarPublic({ resLocals }: { resLocals: Record<string, any> }) {
  const { course, urlPrefix } = resLocals;
  return html`
    <li class="nav-item btn-group">
      <a
        class="nav-link"
        aria-label="Link to page showing all public questions for the course."
        href="${urlPrefix}/questions"
      >
        ${course?.short_name ?? ''}
      </a>
    </li>
  `;
}

function NavbarInstitution({ resLocals }: { resLocals: Record<string, any> }) {
  const { institution } = resLocals;
  return html`
    <li class="nav-item">
      <a class="nav-link" href="/pl/institution/${institution.id}/admin/courses">
        ${institution.short_name} (${institution.long_name})
      </a>
    </li>
  `;
}

function NavbarAdministratorInstitution({ resLocals }: { resLocals: Record<string, any> }) {
  const { institution } = resLocals;
  return html`
    <li class="nav-item">
      <a class="nav-link" href="/pl/administrator/institutions">Admin</a>
    </li>

    <li class="nav-item">
      <a class="nav-link" href="/pl/administrator/institution/${institution.id}">
        ${institution.short_name}
      </a>
    </li>
  `;
}
