import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Institution } from '../../../lib/db-types.js';

export function InstitutionAdminAdmins({
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
        ${HeadContents({ resLocals, pageTitle: `Admins — ${institution.short_name}` })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'admins',
        })}
        <main id="content" class="container mb-4">
          <div class="alert alert-primary" role="alert">
            Institution administrators are coming soon!
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
