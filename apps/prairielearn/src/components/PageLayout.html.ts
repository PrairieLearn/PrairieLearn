import { html, type HtmlSafeString } from '@prairielearn/html';

import type { Institution } from '../lib/db-types.js';

import { HeadContents } from './HeadContents.html.js';
import { Navbar } from './Navbar.html.js';
import type { NavbarType, NavPage, NavSubPage } from './Navbar.types.js';

export function PageLayout({
  resLocals,
  options,
  content,
}: {
  resLocals: Record<string, any>;
  options: {
    institution?: Institution;
    mainClass?: string;
    navPage?: NavPage;
    navSubPage?: NavSubPage;
    navbarType?: NavbarType;
    pageTitle?: string;
  };
  content: HtmlSafeString;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: options.pageTitle })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution: options.institution },
          navbarType: options.navbarType,
          navPage: options.navPage,
          navSubPage: options.navSubPage,
        })}
        <main id="content" ${options.mainClass ? `class=${options.mainClass}` : ''}>
          ${content}
        </main>
      </body>
    </html>
  `;
}
