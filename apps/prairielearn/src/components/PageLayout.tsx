import clsx from 'clsx';
import type { ReactNode } from 'react';

import { compiledScriptTag, compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { formatDateFriendly } from '@prairielearn/formatter';
import { HtmlSafeString, html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { getNavPageTabs } from '../lib/navPageTabs.js';
import { computeStatus } from '../lib/publishing.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import { AssessmentNavigation } from './AssessmentNavigation.js';
import { HeadContents } from './HeadContents.js';
import { Navbar } from './Navbar.js';
import type { NavContext } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.js';
import { PageFooter } from './PageFooter.js';
import { SideNav } from './SideNav.js';
import { SyncErrorsAndWarnings } from './SyncErrorsAndWarnings.js';

function asHtmlSafe(
  content: HtmlSafeString | HtmlSafeString[] | ReactNode | undefined,
): HtmlSafeString | HtmlSafeString[] | undefined {
  if (Array.isArray(content) || content instanceof HtmlSafeString || content === undefined) {
    return content;
  }
  return renderHtml(content);
}

function SyncErrorsAndWarningsForContext({
  navContext,
  resLocals,
}: {
  navContext: NavContext;
  resLocals: UntypedResLocals;
}) {
  if (navContext.type !== 'instructor') return null;
  const { course, urlPrefix, authz_data: authzData } = resLocals;

  if (!course || !urlPrefix || !authzData) return null;

  // The file editor renders its own SyncErrorsAndWarnings component with different wording.
  if (navContext.subPage === 'file_edit') return null;

  switch (navContext.page) {
    case 'course_admin': {
      return (
        <SyncErrorsAndWarnings
          authzData={authzData}
          exampleCourse={course.example_course}
          syncErrors={course.sync_errors}
          syncWarnings={course.sync_warnings}
          fileEditUrl={`${urlPrefix}/course_admin/file_edit/infoCourse.json`}
          context="course"
        />
      );
    }
    case 'instance_admin': {
      const { course_instance: courseInstance, course } = resLocals;
      if (!courseInstance || !course) return null;
      return (
        <SyncErrorsAndWarnings
          authzData={authzData}
          exampleCourse={course.example_course}
          syncErrors={courseInstance.sync_errors}
          syncWarnings={courseInstance.sync_warnings}
          fileEditUrl={`${urlPrefix}/instance_admin/file_edit/courseInstances/${courseInstance.short_name}/infoCourseInstance.json`}
          context="course instance"
        />
      );
    }
    case 'assessment': {
      const { assessment, course_instance: courseInstance } = resLocals;
      if (!assessment || !courseInstance) return null;

      return (
        <SyncErrorsAndWarnings
          authzData={authzData}
          exampleCourse={course.example_course}
          syncErrors={assessment.sync_errors}
          syncWarnings={assessment.sync_warnings}
          fileEditUrl={`${urlPrefix}/assessment/${assessment.id}/file_edit/courseInstances/${courseInstance.short_name}/assessments/${assessment.tid}/infoAssessment.json`}
          context="assessment"
        />
      );
    }
    case 'question':
    case 'public_question': {
      const { question } = resLocals;
      if (!question) return null;
      return (
        <SyncErrorsAndWarnings
          authzData={authzData}
          exampleCourse={course.example_course}
          syncErrors={question.sync_errors}
          syncWarnings={question.sync_warnings}
          fileEditUrl={`${urlPrefix}/question/${question.id}/file_edit/questions/${question.qid}/info.json`}
          context="question"
        />
      );
    }
    default:
      return null;
  }
}

function LegacyPublishingBannerComponent({
  navContext,
  resLocals,
}: {
  navContext: NavContext;
  resLocals: UntypedResLocals;
}) {
  if (navContext.type !== 'instructor') return null;
  if (navContext.page !== 'instance_admin' || navContext.subPage !== 'students') return null;

  const { course_instance: courseInstance } = resLocals;

  // Only show banner if using legacy publishing
  if (!courseInstance || courseInstance.modern_publishing) return null;

  return (
    <div
      className="alert alert-warning py-2 mb-0 rounded-0 border-0 border-bottom small"
      role="alert"
    >
      You are using access rules to control who can access the course instance.{' '}
      <a
        href="https://docs.prairielearn.com/courseInstance/#migrating-from-allowaccess"
        className="alert-link"
      >
        Migrate to publishing
      </a>{' '}
      to unlock additional enrollment management features.
    </div>
  );
}

function UnpublishedBannerComponent({
  navContext,
  resLocals,
}: {
  navContext: NavContext;
  resLocals: UntypedResLocals;
}) {
  if (navContext.type !== 'instructor') return null;
  if (!navContext.page) return null;
  if (!['instance_admin', 'assessment'].includes(navContext.page)) return null;
  if (navContext.page === 'instance_admin' && navContext.subPage === 'publishing') return null;

  const { course_instance: courseInstance, urlPrefix } = resLocals;

  if (!courseInstance || !urlPrefix) return null;

  // Only show banner if modern publishing is enabled
  if (!courseInstance.modern_publishing) return null;

  // Check if the course instance is unpublished
  const status = computeStatus(
    courseInstance.publishing_start_date,
    courseInstance.publishing_end_date,
  );

  if (status !== 'unpublished' && status !== 'publish_scheduled') return null;

  const message = run(() => {
    switch (status) {
      case 'unpublished':
        if (courseInstance.publishing_end_date) {
          return `This course instance is no longer accessible to students because it was unpublished at ${formatDateFriendly(courseInstance.publishing_end_date, courseInstance.display_timezone, { timeFirst: true })}.`;
        }
        return 'This course instance is not accessible to students because it is unpublished.';
      case 'publish_scheduled':
        return `This course instance will be accessible to students after the scheduled publish date of ${formatDateFriendly(courseInstance.publishing_start_date, courseInstance.display_timezone, { timeFirst: true })}.`;
      default:
        assertNever(status);
    }
  });

  return (
    <div
      className="alert alert-warning py-2 mb-0 rounded-0 border-0 border-bottom small"
      role="alert"
    >
      {message}{' '}
      <a href={`${urlPrefix}/instance_admin/publishing`} className="alert-link">
        Configure publishing settings
      </a>
    </div>
  );
}

export function PageLayout({
  resLocals,
  pageTitle,
  navContext,
  options = {},
  headContent,
  preContent,
  content,
  postContent,
}: {
  /** The locals object from the Express response. */
  resLocals: UntypedResLocals;
  /** The title of the page in the browser. */
  pageTitle: string;
  /** The information used to configure the navbar. */
  navContext: NavContext;
  options?: {
    /** Whether the main container should span the entire width of the page. */
    fullWidth?: boolean;
    /** Sets the html and body tag heights to 100% */
    fullHeight?: boolean;
    /** Whether the page content should have padding around it. */
    contentPadding?: boolean;
    /** Additional classes to apply to the main content container. */
    contentContainerClassName?: string;
    /** A note to display after the pageTitle, shown in parenthesis. */
    pageNote?: string;
    /** Enables an htmx extension for an element and all its children */
    hxExt?: string;
    /** Dataset attributes to add to the body tag. The "data-" prefix will be added, so do not include it. */
    dataAttributes?: Record<string, string>;
    /** Whether or not the navbar should be shown. */
    enableNavbar?: boolean;
    /**
     * Forces the side nav to be in a specific state when the page loads,
     * regardless of the user's previous preference.
     *
     * If a value is provided, any state toggles that happen on the client
     * will not be persisted to the user's session.
     */
    forcedInitialNavToggleState?: boolean;
    /** Whether or not to show the branded page footer. */
    showFooter?: boolean;
  };
  /** Include scripts and other additional head content here. */
  headContent?: HtmlSafeString | HtmlSafeString[] | ReactNode;
  /** The content of the page in the body before the main container. */
  preContent?: HtmlSafeString | HtmlSafeString[] | ReactNode;
  /** The main content of the page within the main container. */
  content: HtmlSafeString | HtmlSafeString[] | ReactNode;
  /** The content of the page in the body after the main container. */
  postContent?: HtmlSafeString | HtmlSafeString[] | ReactNode;
}) {
  const resolvedOptions = {
    fullWidth: false,
    fullHeight: false,
    contentPadding: true,
    contentContainerClassName: '',
    hxExt: '',
    dataAttributes: {},
    enableNavbar: true,
    showFooter: false,
    ...options,
  };

  const headContentString = asHtmlSafe(headContent);
  const preContentString = asHtmlSafe(preContent);
  const contentString = asHtmlSafe(content);
  const postContentString = asHtmlSafe(postContent);

  // The side navbar is only available if the user is on an course instructor page.
  const sideNavEnabled = resLocals.course && navContext.type === 'instructor';

  const sideNavExpanded =
    sideNavEnabled && (resolvedOptions.forcedInitialNavToggleState ?? resLocals.side_nav_expanded);

  let showContextNavigation = [
    'instructor',
    'administrator_institution',
    'administrator',
    'institution',
  ].includes(navContext.type ?? '');

  // If additional navigation capabilities are not needed, such as on the
  // course staff and sync pages, then the context navigation is not shown.
  if (navContext.page === 'course_admin') {
    const navPageTabs = getNavPageTabs();

    const courseAdminSettingsNavSubPages = navPageTabs.course_admin.flatMap(
      (tab) => tab.activeSubPage,
    );

    // If the user is on a course admin settings subpage, show ContextNavigation
    if (navContext.subPage && courseAdminSettingsNavSubPages.includes(navContext.subPage)) {
      showContextNavigation = true;
    } else {
      showContextNavigation = false;
    }
  } else if (navContext.page === 'instance_admin') {
    const navPageTabs = getNavPageTabs();

    const instanceAdminSettingsNavSubPages = navPageTabs.instance_admin.flatMap(
      (tab) => tab.activeSubPage,
    );

    // If the user is on a instance admin settings subpage, show ContextNavigation
    if (navContext.subPage && instanceAdminSettingsNavSubPages.includes(navContext.subPage)) {
      showContextNavigation = true;
    } else {
      showContextNavigation = false;
    }
  }

  if (sideNavEnabled && resolvedOptions.showFooter) {
    throw new Error('Cannot show the footer when the side nav is enabled.');
  }

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({
          resLocals,
          pageTitle,
          pageNote: resolvedOptions.pageNote,
        })}
        ${compiledStylesheetTag('pageLayout.css')} ${headContentString}
        ${sideNavEnabled ? compiledScriptTag('pageLayoutClient.ts') : ''}
      </head>
      <body
        class="${clsx({
          'd-flex flex-column': resolvedOptions.fullHeight || resolvedOptions.showFooter,
          'h-100': resolvedOptions.fullHeight,
          'min-vh-100': resolvedOptions.showFooter,
        })}"
        hx-ext="${resolvedOptions.hxExt}"
        ${unsafeHtml(
          Object.entries(resolvedOptions.dataAttributes)
            .map(([key, value]) => `data-${key}="${value}"`)
            .join(' '),
        )}
      >
        <div
          id="app-container"
          class="${clsx(
            'app-container',
            sideNavEnabled && 'side-nav-enabled',
            // Collapsed state for wider viewports (768px and above).
            // Persisted in the user session.
            !sideNavExpanded && 'collapsed',
            // Separate collapsed state for narrower viewports (768px and below).
            // Not persisted.
            'mobile-collapsed',
            resolvedOptions.fullHeight && 'h-100',
            resolvedOptions.showFooter && 'flex-grow-1',
          )}"
        >
          ${resolvedOptions.enableNavbar
            ? html`<div class="app-top-nav">
                ${Navbar({
                  resLocals,
                  navPage: navContext.page,
                  navSubPage: navContext.subPage,
                  navbarType: navContext.type,
                  sideNavEnabled,
                })}
              </div>`
            : ''}
          ${sideNavEnabled
            ? html`
                <nav class="app-side-nav bg-light border-end" aria-label="Course navigation">
                  <div class="app-side-nav-scroll">
                    ${SideNav({
                      resLocals,
                      page: navContext.page,
                      subPage: navContext.subPage,
                      sideNavExpanded,
                      persistToggleState: resolvedOptions.forcedInitialNavToggleState === undefined,
                    })}
                  </div>
                </nav>
              `
            : ''}
          <div class="${clsx(sideNavEnabled && 'app-main', resolvedOptions.fullHeight && 'h-100')}">
            <div
              class="${clsx(
                sideNavEnabled && 'app-main-container',
                !sideNavEnabled && resolvedOptions.fullWidth && 'w-100',
                !sideNavEnabled && resolvedOptions.fullHeight && 'h-100',
                'd-flex flex-column',
                resolvedOptions.contentContainerClassName,
              )}"
            >
              ${renderHtml(
                <LegacyPublishingBannerComponent navContext={navContext} resLocals={resLocals} />,
              )}
              ${renderHtml(
                <UnpublishedBannerComponent navContext={navContext} resLocals={resLocals} />,
              )}
              ${resLocals.assessment && resLocals.course_instance && sideNavEnabled
                ? AssessmentNavigation({
                    courseInstanceId: resLocals.course_instance.id,
                    subPage: navContext.subPage,
                    assessment: resLocals.assessment,
                    assessmentSet: resLocals.assessment_set,
                  })
                : ''}
              ${showContextNavigation
                ? ContextNavigation({
                    resLocals,
                    navPage: navContext.page,
                    navSubPage: navContext.subPage,
                  })
                : ''}
              ${preContentString}
              <main
                id="content"
                class="${clsx(
                  resolvedOptions.contentPadding
                    ? resolvedOptions.fullWidth
                      ? 'container-fluid'
                      : 'container'
                    : null,
                  resolvedOptions.contentPadding && 'pt-3',
                  resolvedOptions.contentPadding && sideNavEnabled && 'px-3',
                  resolvedOptions.contentPadding && 'pb-3',
                  resolvedOptions.fullHeight && 'h-100',
                )}"
              >
                ${renderHtml(
                  <SyncErrorsAndWarningsForContext navContext={navContext} resLocals={resLocals} />,
                )}
                ${contentString}
              </main>
              ${postContentString}
            </div>
          </div>
        </div>
        ${resolvedOptions.showFooter ? renderHtml(<PageFooter />) : ''}
      </body>
    </html>
  `.toString();
}
