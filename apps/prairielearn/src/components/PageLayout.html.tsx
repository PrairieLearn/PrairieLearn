import { clsx } from 'clsx';

import { type HtmlValue, html } from '@prairielearn/html';
import { type VNode } from '@prairielearn/preact-cjs';

import {
  compiledScriptPath,
  compiledScriptTag,
  compiledStylesheetPath,
  compiledStylesheetTag,
} from '../lib/assets.js';
import { getNavPageTabs } from '../lib/navPageTabs.js';

import { AssessmentNavigation } from './AssessmentNavigation.html.js';
import { HeadContents, PreactHeadContents } from './HeadContents.html.js';
import { Navbar, PreactNavbar } from './Navbar.html.js';
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
            pageNote: options.pageNote,
          })}
          ${compiledStylesheetTag('pageLayout.css')} ${headContent}
          ${sideNavEnabled ? compiledScriptTag('pageLayoutClient.ts') : ''}
        </head>
        <body
          ${options.hxExt ? html`hx-ext="${options.hxExt}"` : ''}
          class="${options.fullHeight ? 'd-flex flex-column h-100' : ''}"
        >
          <div
            id="app-container"
            class="${clsx(
              'app-container',
              sideNavEnabled && 'side-nav-enabled',
              !sideNavExpanded && 'collapsed',
            )}"
          >
            <div class="app-top-nav">
              ${Navbar({
                resLocals,
                navPage: navContext.page,
                navSubPage: navContext.subPage,
                navbarType: navContext.type,
                isInPageLayout: true,
              })}
            </div>
            ${sideNavEnabled
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
            <div class="${sideNavEnabled ? 'app-main' : ''}">
              <div class="${sideNavEnabled ? 'app-main-container' : ''}">
                ${resLocals.assessment &&
                resLocals.assessments &&
                AssessmentNavigation({
                  subPage: navContext.subPage,
                  courseInstance: resLocals.course_instance,
                  assessment: resLocals.assessment,
                  assessments: resLocals.assessments,
                })}
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
                  class="${clsx(
                    options.fullWidth ? 'container-fluid' : 'container',
                    marginBottom && 'mb-4',
                    options.fullHeight && 'flex-grow-1',
                    'pt-3',
                    sideNavEnabled && 'px-3',
                  )}"
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
  }

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
        ${options.hxExt ? html`hx-ext="${options.hxExt}"` : ''}
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

export function PreactPageLayout({
  resLocals,
  pageTitle,
  navContext,
  // eslint-disable-next-line @eslint-react/no-unstable-default-props -- Not a real component.
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
  headContent?: VNode;
  /** The content of the page in the body before the main container. */
  preContent?: VNode;
  /** The main content of the page within the main container. */
  content: VNode;
  /** The content of the page in the body after the main container. */
  postContent?: VNode;
}) {
  const marginBottom = options.marginBottom ?? true;

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

    return (
      <html lang="en">
        <head>
          <PreactHeadContents
            resLocals={resLocals}
            pageTitle={pageTitle}
            pageNote={options.pageNote}
          />
          <link rel="stylesheet" href={compiledStylesheetPath('pageLayout.css')} />
          {headContent}
          <script src={compiledScriptPath('pageLayoutClient.ts')} />
        </head>
        <body class={options.fullHeight ? 'd-flex flex-column h-100' : ''} hx-ext={options.hxExt}>
          <div
            id="app-container"
            class={clsx(
              'app-container',
              sideNavEnabled && 'side-nav-enabled',
              !sideNavExpanded && 'collapsed',
            )}
          >
            <div class="app-top-nav">
              <PreactNavbar
                resLocals={resLocals}
                navPage={navContext.page}
                navSubPage={navContext.subPage}
                navbarType={navContext.type}
                isInPageLayout
              />
            </div>
            {sideNavEnabled ? (
              <div
                class="app-side-nav"
                // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
                dangerouslySetInnerHTML={{
                  __html: SideNav({
                    resLocals,
                    page: navContext.page,
                    subPage: navContext.subPage,
                  }).toString(),
                }}
              />
            ) : (
              ''
            )}
            <div class={sideNavEnabled ? 'app-main' : ''}>
              <div class={sideNavEnabled ? 'app-main-container' : ''}>
                {resLocals.assessment && resLocals.assessments && (
                  <div
                    // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
                    dangerouslySetInnerHTML={{
                      __html: AssessmentNavigation({
                        subPage: navContext.subPage,
                        courseInstance: resLocals.course_instance,
                        assessment: resLocals.assessment,
                        assessments: resLocals.assessments,
                      }).toString(),
                    }}
                  />
                )}

                {showContextNavigation ? (
                  <div
                    // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
                    dangerouslySetInnerHTML={{
                      __html: ContextNavigation({
                        resLocals,
                        navPage: navContext.page,
                        navSubPage: navContext.subPage,
                      }).toString(),
                    }}
                  />
                ) : null}
                {preContent}
                <main
                  id="content"
                  class={clsx(
                    options.fullWidth ? 'container-fluid' : 'container',
                    marginBottom && 'mb-4',
                    options.fullHeight && 'flex-grow-1',
                    'pt-3',
                    sideNavEnabled && 'px-3',
                  )}
                >
                  {content}
                </main>
                {postContent}
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" class={options.fullHeight ? 'h-100' : ''}>
      <head>
        <PreactHeadContents
          resLocals={resLocals}
          pageTitle={pageTitle}
          pageNote={options.pageNote}
        />
        {headContent}
      </head>
      <body hx-ext={options.hxExt} class={options.fullHeight ? 'd-flex flex-column h-100' : ''}>
        <PreactNavbar
          resLocals={resLocals}
          navPage={navContext.page}
          navSubPage={navContext.subPage}
          navbarType={navContext.type}
        />
        {preContent}
        <main
          id="content"
          class={clsx(
            options.fullWidth ? 'container-fluid' : 'container',
            marginBottom ? 'mb-4' : '',
            options.fullHeight ? 'flex-grow-1' : '',
          )}
        >
          {content}
        </main>
        {postContent}
      </body>
    </html>
  );
}
