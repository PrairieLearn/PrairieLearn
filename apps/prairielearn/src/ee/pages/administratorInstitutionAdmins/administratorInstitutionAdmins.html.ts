import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.html.js';
import { type Institution } from '../../../lib/db-types.js';

export function AdministratorInstitutionAdmins({
  institution,
  resLocals,
}: {
  institution: Institution;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals: {
      ...resLocals,
      institution,
    },
    pageTitle: 'Admins - Institution Admin',
    navContext: {
      type: 'administrator_institution',
      page: 'administrator_institution',
      subPage: 'admins',
    },
    content: html`
      <p>
        Institution administrators can be managed
        <a href="/pl/institution/${institution.id}/admin/admins">here</a>.
      </p>
    `,
  });
}
