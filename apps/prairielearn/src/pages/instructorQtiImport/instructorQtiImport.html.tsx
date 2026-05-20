import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { QtiImportForm } from './components/QtiImportForm.js';

export function InstructorQtiImport({
  resLocals,
  csrfToken,
  trpcCsrfToken,
  returnTo,
}: {
  resLocals: ResLocalsForPage<'course-instance'>;
  csrfToken: string;
  trpcCsrfToken: string;
  returnTo: 'assessments' | 'questions';
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Import QTI content',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'assessments',
    },
    options: {},
    headContent: html`
      <link href="${nodeModulesAssetPath('highlight.js/styles/default.css')}" rel="stylesheet" />
    `,
    content: (
      <Hydrate>
        <QtiImportForm
          courseInstanceId={resLocals.course_instance.id}
          csrfToken={csrfToken}
          trpcCsrfToken={trpcCsrfToken}
          returnTo={returnTo}
        />
      </Hydrate>
    ),
  });
}
