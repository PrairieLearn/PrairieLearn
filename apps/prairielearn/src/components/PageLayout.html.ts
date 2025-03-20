import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { html, type HtmlValue } from '@prairielearn/html';

import { getNavPageTabs } from '../lib/navPageTabs.js';

import { AssessmentNavigation } from './AssessmentNavigation.html.js';
import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';
import type { NavContext } from './Navbar.types.js';
import { ContextNavigation } from './NavbarContext.html.js';
import { SideNav } from './SideNav.html.js';

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
    /** Whether the main container should have a bottom margin of mb-4 in Bootstrap. */
    marginBottom?: boolean;
    /** A note to display after the pageTitle, shown in parenthesis. */
    pageNote?: string;
    /** Enables an htmx extension for an element and all its children */
    hxExt?: string;
    /** Sets the html and body tag heights to 100% */
    fullHeight?: boolean;
  };
  /** Include scripts and other additional head content here. */
  headContent?: HtmlValue;
  /** The content of the page in the body before the main container. */
  preContent?: HtmlValue;
  /** The main content of the page within the main container. */
  content: HtmlValue;
  /** The content of the page in the body after the main container. */
  postContent?: HtmlValue;
}) {
  const marginBottom = options.marginBottom ?? true;

  if (resLocals.has_enhanced_navigation) {
    // The left navbar is only shown if the user is in a
    // page within a course or course instance.
    const showSideNav =
      navContext.type !== 'student' && navContext.type !== 'public' && resLocals.course;
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
            pageNote: options.pageNote,
          })}
          ${compiledStylesheetTag('pageLayout.css')} ${headContent}
        </head>
        <body
          class="${options.fullHeight ? 'd-flex flex-column h-100' : ''}"
          hx-ext="${options.hxExt ?? ''}"
        >
          <div class="app-container ${!showSideNav ? 'no-sidebar' : ''}">
            <div class="app-top-nav">
              ${Navbar({
                resLocals,
                navPage: navContext.page,
                navSubPage: navContext.subPage,
                navbarType: navContext.type,
                isInPageLayout: true,
              })}
            </div>
            ${showSideNav
              ? html`
                  <div class="app-side-nav">
                    ${SideNav({
                      resLocals,
                      page: navContext.page,
                      subPage: navContext.subPage,
                    })}
                  </div>
                `
              : ''}
            <div class="${showSideNav ? 'app-main' : ''}">
              <div class="${showSideNav ? 'app-main-container' : ''}">
                ${resLocals.assessment && resLocals.course_instance &&
                  AssessmentNavigation({
                    courseInstanceId: resLocals.course_instance.id,
                    subPage: navContext.subPage,
                    assessment: resLocals.assessment,
                  })
                }
                ${showContextNavigation
                  ? ContextNavigation({
                      resLocals,
                      navPage: navContext.page,
                      navSubPage: navContext.subPage,
                    })
                  : ''}
                ${preContent}
                <main
                  id="content"
                  class="
                    ${options.fullWidth ? 'container-fluid' : 'container'} 
                    ${marginBottom ? 'mb-4' : ''}
                    ${options.fullHeight ? 'flex-grow-1' : ''}
                    pt-3 ${showSideNav ? 'px-3' : ''}
                  "
                >
                  ${content}
                </main>
                ${postContent}
              </div>
            </div>
          </div>
        </body>
      </html>
    `.toString();
  } else {
    return html`
      <!doctype html>
      <html lang="en" class="${options.fullHeight ? 'h-100' : ''}">
        <head>
          ${HeadContents({
            resLocals,
            pageTitle,
            pageNote: options.pageNote,
          })}
          ${headContent}
        </head>
        <body
          class="${options.fullHeight ? 'd-flex flex-column h-100' : ''}"
          hx-ext="${options.hxExt ?? ''}"
        >
          ${Navbar({
            resLocals,
            navPage: navContext.page,
            navSubPage: navContext.subPage,
            navbarType: navContext.type,
          })}
          ${preContent}
          <main
            id="content"
            class="
            ${options.fullWidth ? 'container-fluid' : 'container'} 
            ${marginBottom ? 'mb-4' : ''}
            ${options.fullHeight ? 'flex-grow-1' : ''}
          "
          >
            ${content}
          </main>
          ${postContent}
        </body>
      </html>
    `.toString();
  }
}
