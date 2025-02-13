import { clsx } from 'clsx';
import { type VNode } from 'preact';

import { html, type HtmlValue } from '@prairielearn/html';

import { HeadContents, PreactHeadContents } from './HeadContents.html.js';
import { Navbar, PreactNavbar } from './Navbar.html.js';
import type { NavContext } from './Navbar.types.js';

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
