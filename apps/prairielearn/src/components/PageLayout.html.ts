import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { html, type HtmlValue } from '@prairielearn/html';

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
    // course or course instance page.
    const showSideNavbar = resLocals.course !== undefined;
    let showContextNavigation = true;

    // ContextNavigation is shown if no left navbar is shown or
    // additional navigation capabilities are needed alongside the
    // left navbar
    if (navContext.page === 'course_admin') {
      if (
        navContext.subPage &&
        ['settings', 'sets', 'modules', 'tags', 'topics', 'staff'].includes(navContext.subPage)
      ) {
        showContextNavigation = true;
      } else {
        showContextNavigation = false;
      }
    } else if (navContext.page === 'instance_admin') {
      showContextNavigation = false;
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
          ${options.hxExt ? `hx-ext="${options.hxExt}"` : ''}
          class="${options.fullHeight ? 'd-flex flex-column h-100' : ''}"
        >
          <div class="app-container ${!showSideNavbar ? 'no-sidebar' : ''}">
            <div class="app-top-nav">
              ${Navbar({
                resLocals,
                navPage: navContext.page,
                navSubPage: navContext.subPage,
                navbarType: navContext.type,
              })}
            </div>
            ${showSideNavbar
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
            <div class="${showSideNavbar ? 'app-main' : ''}">
              <div class="${showSideNavbar ? 'app-main-container' : ''}">
                ${resLocals.assessment &&
                resLocals.assessments &&
                AssessmentNavigation({
                  courseInstance: resLocals.course_instance,
                  assessment: resLocals.assessment,
                  assessments: resLocals.assessments,
                })}
                ${showContextNavigation
                  ? ContextNavigation({
                      resLocals,
                      navPage: navContext.page,
                      navSubPage: navContext.subPage,
                      newNavEnabled: true,
                      fullWidth: options.fullWidth,
                    })
                  : ''}
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
          ${options.hxExt ? `hx-ext="${options.hxExt}"` : ''}
          class="${options.fullHeight ? 'd-flex flex-column h-100' : ''}"
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
