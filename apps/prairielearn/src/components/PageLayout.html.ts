import { html, type HtmlValue } from '@prairielearn/html';

import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';
import type { NavbarType, NavPage, NavSubPage } from './Navbar.types.js';

/**
 * Provides the standard layout for a page, including the head, navbar, and main content.
 *
 * @param resLocals The locals object from the Express response.
 * @param pageTitle The title of the page in the browser.
 * @param navPage The main page to highlight in the navbar.
 * @param options.fullWidth Whether the main container should span the entire width of the page.
 * @param options.marginBottom Whether the main container should have a bottom margin of mb-4 in Bootstrap.
 * @param options.pageNote A note to display after the pageTitle, shown in parenthesis.
 * @param options.navSubPage The current subpage, accounted for in the navbar.
 * @param options.navbarType The type of navbar to render, based on the type of user.
 * @param headContent Include scripts and other additional head content here.
 * @param content The main content of the page within the main container.
 */
export function PageLayout({
  resLocals,
  pageTitle,
  navPage,
  options = {},
  headContent,
  content,
}: {
  resLocals: Record<string, any>;
  pageTitle: string;
  navPage: NavPage;
  options?: {
    fullWidth?: boolean;
    marginBottom?: boolean;
    pageNote?: string;
    navSubPage?: NavSubPage;
    navbarType?: NavbarType;
  };
  headContent?: HtmlValue;
  content: HtmlValue;
}) {
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
      <body>
        ${Navbar({
          resLocals,
          navPage,
          navSubPage: options.navSubPage,
        })}
        <main
          id="content"
          class="
            ${options.fullWidth ? 'container-fluid' : 'container'} 
            ${options.marginBottom ? 'mb-4' : ''}"
        >
          ${content}
        </main>
      </body>
    </html>
  `.toString();
}
