import { html, type HtmlValue } from '@prairielearn/html';

import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';
import type { NavbarType, NavPage, NavSubPage } from './Navbar.types.js';

export function PageLayout({
  resLocals,
  pageTitle,
  navPage,
  options = {
    marginBottom: true,
  },
  headContent,
  content,
}: {
  /** The locals object from the Express response. */
  resLocals: Record<string, any>;
  /** The title of the page in the browser. */
  pageTitle: string;
  /** The main page to highlight in the navbar. */
  navPage: NavPage;
  options?: {
    /** Whether the main container should span the entire width of the page. */
    fullWidth?: boolean;
    /** Whether the main container should have a bottom margin of mb-4 in Bootstrap. */
    marginBottom?: boolean;
    /** A note to display after the pageTitle, shown in parenthesis. */
    pageNote?: string;
    /** The current subpage, accounted for in the navbar. */
    navSubPage?: NavSubPage;
    /** The type of navbar to render, based on the type of user. */
    navbarType?: NavbarType;
    /** Enables an htmx extension for an element and all its children */
    hxExt?: string;
  };
  /** Include scripts and other additional head content here. */
  headContent?: HtmlValue;
  /** The main content of the page within the main container. */
  content: HtmlValue;
}) {
  const marginBottom = options.marginBottom ?? true;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({
          resLocals,
          pageTitle,
          pageNote: options.pageNote,
        })}
        ${headContent}
      </head>
      <body ${options.hxExt ? `hx-ext="${options.hxExt}"` : ''}>
        ${Navbar({
          resLocals,
          navPage,
          navSubPage: options.navSubPage,
        })}
        <main
          id="content"
          class="
            ${options.fullWidth ? 'container-fluid' : 'container'} 
            ${marginBottom ? 'mb-4' : ''}
          "
        >
          ${content}
        </main>
      </body>
    </html>
  `.toString();
}
