import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Institution } from '../../../lib/db-types.js';

export function AdministratorInstitutionAdmins({
  institution,
  resLocals,
}: {
  institution: Institution;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Admins - Institution Admin' })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
          navSubPage: 'admins',
        })}
        <main class="container mb-4">
          <p>
            Institution administrators can be managed
            <a href="/pl/institution/${institution.id}/admin/admins">here</a>.
          </p>
        </main>
      </body>
    </html>
  `.toString();
}
