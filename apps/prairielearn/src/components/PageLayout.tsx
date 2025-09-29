import clsx from 'clsx';

import { compiledScriptTag, compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { HtmlSafeString, html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import type { VNode } from '@prairielearn/preact-cjs';

import { getNavPageTabs } from '../lib/navPageTabs.js';

import { AssessmentNavigation } from './AssessmentNavigation.js';
import { HeadContents } from './HeadContents.js';
import { Navbar } from './Navbar.js';
import type { NavContext } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.js';
import { SideNav } from './SideNav.js';

function asHtmlSafe(
  content: HtmlSafeString | HtmlSafeString[] | VNode<any> | undefined,
): HtmlSafeString | HtmlSafeString[] | undefined {
  if (Array.isArray(content) || content instanceof HtmlSafeString || content === undefined) {
    return content;
  }
  return renderHtml(content);
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
  resLocals: Record<string, any>;
  /** The title of the page in the browser. */
  pageTitle: string;
  /** The information used to configure the navbar. */
  navContext: NavContext;
  options?: {
    /** Whether the main container should span the entire width of the page. */
    fullWidth?: boolean;
    /** Whether the main container should have a bottom padding of pb-4 in Bootstrap. */
    paddingBottom?: boolean;
    /** A note to display after the pageTitle, shown in parenthesis. */
    pageNote?: string;
    /** Enables an htmx extension for an element and all its children */
    hxExt?: string;
    /** Sets the html and body tag heights to 100% */
    fullHeight?: boolean;
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
    hxExt: '',
    paddingBottom: true,
    fullHeight: false,
    fullWidth: false,
    ...options,
  };

  const headContentString = asHtmlSafe(headContent);
  const preContentString = asHtmlSafe(preContent);
  const contentString = asHtmlSafe(content);
  const postContentString = asHtmlSafe(postContent);

  if (resLocals.has_enhanced_navigation) {
    // The side navbar is only available if the user is in a page within a course or course instance.
    const sideNavEnabled =
      resLocals.course && navContext.type !== 'student' && navContext.type !== 'public';

    const sideNavExpanded = sideNavEnabled && resLocals.side_nav_expanded;

    let showContextNavigation = true;

    // ContextNavigation is shown if either:
    // The side nav is not shown.
    // The side nav is shown and additional navigation capabilities are needed, such as on the course admin settings pages.
    if (navContext.page === 'course_admin') {
      const navPageTabs = getNavPageTabs(true);

      const courseAdminSettingsNavSubPages = navPageTabs.course_admin
        ?.map((tab) => tab.activeSubPage)
        .flat();

      // If the user is on a course admin settings subpage, show ContextNavigation
      if (navContext.subPage && courseAdminSettingsNavSubPages?.includes(navContext.subPage)) {
        showContextNavigation = true;
      } else {
        showContextNavigation = false;
      }
    } else if (navContext.page === 'instance_admin') {
      const navPageTabs = getNavPageTabs(true);

      const instanceAdminSettingsNavSubPages = navPageTabs.instance_admin
        ?.map((tab) => tab.activeSubPage)
        .flat();

      // If the user is on a instance admin settings subpage, show ContextNavigation
      if (navContext.subPage && instanceAdminSettingsNavSubPages?.includes(navContext.subPage)) {
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
            )}"
          >
            <div class="app-top-nav">
              ${Navbar({
                resLocals,
                navPage: navContext.page,
                navSubPage: navContext.subPage,
                navbarType: navContext.type,
                isInPageLayout: true,
                sideNavEnabled,
              })}
            </div>
            ${sideNavEnabled
              ? html`
                  <nav class="app-side-nav bg-light border-end" aria-label="Course navigation">
                    <div class="app-side-nav-scroll">
                      ${SideNav({
                        resLocals,
                        page: navContext.page,
                        subPage: navContext.subPage,
                      })}
                    </div>
                  </nav>
                `
              : ''}
            <div
              class="${clsx(sideNavEnabled && 'app-main', resolvedOptions.fullHeight && 'h-100')}"
            >
              <div class="${sideNavEnabled ? 'app-main-container' : ''}">
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
                    resolvedOptions.fullWidth ? 'container-fluid' : 'container',
                    resolvedOptions.paddingBottom && 'pb-4',
                    resolvedOptions.fullHeight && 'h-100',
                    'pt-3',
                    sideNavEnabled && 'px-3',
                  )}"
                >
                  ${contentString}
                </main>
                ${postContentString}
              </div>
            </div>
          </div>
        </body>
      </html>
    `.toString();
  } else {
    return html`
      <!doctype html>
      <html lang="en" class="${resolvedOptions.fullHeight ? 'h-100' : ''}">
        <head>
          ${HeadContents({
            resLocals,
            pageTitle,
            pageNote: resolvedOptions.pageNote,
          })}
          ${compiledStylesheetTag('pageLayout.css')} ${headContentString}
        </head>
        <body
          class="${resolvedOptions.fullHeight ? 'd-flex flex-column h-100' : ''}"
          hx-ext="${resolvedOptions.hxExt}"
        >
          ${Navbar({
            resLocals,
            navPage: navContext.page,
            navSubPage: navContext.subPage,
            navbarType: navContext.type,
          })}
          ${preContentString}
          <main
            id="content"
            class="
            ${clsx(
              resolvedOptions.fullWidth ? 'container-fluid' : 'container',
              resolvedOptions.paddingBottom && 'pb-4',
              resolvedOptions.fullHeight && 'flex-grow-1',
            )}
          "
          >
            ${contentString}
          </main>
          ${postContentString}
        </body>
      </html>
    `.toString();
  }
}
