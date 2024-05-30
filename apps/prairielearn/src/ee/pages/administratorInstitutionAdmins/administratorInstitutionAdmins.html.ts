import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Institution } from '../../../lib/db-types.js';

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
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'administrator_institution',
          pageTitle: 'Admins',
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
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
