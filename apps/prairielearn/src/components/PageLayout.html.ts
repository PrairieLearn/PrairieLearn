import { html, type HtmlValue } from '@prairielearn/html';

import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';
import type { NavContext } from './Navbar.types.js';

export function PageLayout({
  resLocals,
  pageTitle,
  navContext,
  options = {
    marginBottom: true,
  },
  content,
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
  };
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
      </head>
      <body>
        ${Navbar({
          resLocals,
          navPage: navContext.page,
          navSubPage: navContext.subPage,
          navbarType: navContext.type,
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
