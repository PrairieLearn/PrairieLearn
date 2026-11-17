import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { type Institution } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { CourseRequestMessageSection } from '../../components/courseRequestMessage/CourseRequestMessageSection.js';

export function InstitutionAdminGeneral({
  institution,
  courseRequestMessage,
  courseRequestMessageHtml,
  resLocals,
}: {
  institution: Institution;
  courseRequestMessage: string | null;
  courseRequestMessageHtml: string;
  resLocals: ResLocalsForPage<'plain'>;
}) {
  return PageLayout({
    resLocals: {
      ...resLocals,
      institution,
    },
    pageTitle: `General — ${institution.short_name}`,
    navContext: {
      type: 'institution',
      page: 'institution_admin',
      subPage: 'general',
    },
    content: html`
      ${CourseRequestMessageSection({
        csrfToken: resLocals.__csrf_token,
        description: html`
          This message is shown to users from your institution on the
          <a href="/pl/request_course">course request page</a>. Use it to share institution-specific
          information such as licensing, costs, training resources, or contacts. Markdown formatting
          is supported; HTML tags are not rendered.
        `,
        courseRequestMessage,
        courseRequestMessageHtml,
      })}
    `,
  });
}
