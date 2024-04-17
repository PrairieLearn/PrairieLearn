import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { type Institution } from '../../../lib/db-types';

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
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          pageTitle: `Admins — ${institution.short_name}`,
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'admins',
        })}
        <main class="container mb-4">
          <div class="alert alert-primary" role="alert">
            Institution administrators are coming soon!
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
