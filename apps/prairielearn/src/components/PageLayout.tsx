import clsx from 'clsx';

import { compiledScriptTag, compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { HtmlSafeString, html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import type { VNode } from '@prairielearn/preact-cjs';

import { getNavPageTabs } from '../lib/navPageTabs.js';
import { computeStatus } from '../lib/publishing.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import { AssessmentNavigation } from './AssessmentNavigation.js';
import { HeadContents } from './HeadContents.js';
import { Navbar } from './Navbar.js';
import type { NavContext } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.js';
import { SideNav } from './SideNav.js';
import { SyncErrorsAndWarnings } from './SyncErrorsAndWarnings.js';

function asHtmlSafe(
  content: HtmlSafeString | HtmlSafeString[] | VNode<any> | undefined,
): HtmlSafeString | HtmlSafeString[] | undefined {
  if (Array.isArray(content) || content instanceof HtmlSafeString || content === undefined) {
    return content;
  }
  return renderHtml(content);
}

function SyncErrorsAndWarningsComponent({
  navContext,
  resLocals,
}: {
  navContext: NavContext;
  resLocals: UntypedResLocals;
}) {
  if (navContext.type !== 'instructor') return null;
  const { course, urlPrefix, authz_data: authzData } = resLocals;

  if (!course || !urlPrefix || !authzData) return null;

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

      // This should never happen, but we are waiting on a better type system for res.locals.authz_data
      // to be able to express this.
      if (authzData.has_course_instance_permission_edit === undefined) {
        throw new Error('has_course_instance_permission_edit is undefined');
      }

      return (
        <SyncErrorsAndWarnings
          authzData={{
            has_course_instance_permission_edit: authzData.has_course_instance_permission_edit,
          }}
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

function UnpublishedBannerComponent({
  navContext,
  resLocals,
}: {
  navContext: NavContext;
  resLocals: UntypedResLocals;
}) {
  if (navContext.type !== 'instructor') return null;
  if (!navContext.page) return null;
  if (!['instance_admin', 'assessment', 'question'].includes(navContext.page)) {
    return null;
  }

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

  if (status !== 'unpublished') return null;

  return (
    <div class="alert alert-warning py-2 mb-0 rounded-0 border-0 border-bottom small" role="alert">
      Students will not be able to access the course instance until it is published.{' '}
      <a href={`${urlPrefix}/instance_admin/publishing`} class="alert-link">
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
  };
  /** Include scripts and other additional head content here. */
  headContent?: HtmlSafeString | HtmlSafeString[] | VNode<any>;
  /** The content of the page in the body before the main container. */
  preContent?: HtmlSafeString | HtmlSafeString[] | VNode<any>;
  /** The main content of the page within the main container. */
  content: HtmlSafeString | HtmlSafeString[] | VNode<any>;
  /** The content of the page in the body after the main container. */
  postContent?: HtmlSafeString | HtmlSafeString[] | VNode<any>;
}) {
  const resolvedOptions = {
    fullWidth: false,
    fullHeight: false,
    contentPadding: true,
    hxExt: '',
    dataAttributes: {},
    enableNavbar: true,
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
        class="${resolvedOptions.fullHeight ? 'd-flex flex-column h-100' : ''}"
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
          )}"
        >
          ${resolvedOptions.enableNavbar
            ? html`<div class="app-top-nav">
                ${Navbar({
                  resLocals,
                  navPage: navContext.page,
                  navSubPage: navContext.subPage,
                  navbarType: navContext.type,
                  isInPageLayout: true,
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
                sideNavEnabled ? 'app-main-container' : 'h-100 w-100',
                'd-flex flex-column',
              )}"
            >
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
                  <SyncErrorsAndWarningsComponent navContext={navContext} resLocals={resLocals} />,
                )}
                ${contentString}
              </main>
              ${postContentString}
            </div>
          </div>
        </div>
      </body>
    </html>
  `.toString();
}
