import { html } from '@prairielearn/html';

import { JobSequenceResults } from '../../components/JobSequenceResults.js';
import { PageLayout } from '../../components/PageLayout.js';
import { compiledScriptTag } from '../../lib/assets.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';
import type { JobSequenceWithTokens } from '../../lib/server-jobs.types.js';

export function JobSequence({
  resLocals,
  job_sequence,
  referrer,
}: {
  resLocals: UntypedResLocals;
  job_sequence: JobSequenceWithTokens;
  referrer: string | null;
}) {
  return PageLayout({
    resLocals,
    pageTitle: `${job_sequence.description} #${job_sequence.number}`,
    navContext: {
      type: resLocals.navbarType,
      page: resLocals.navPage,
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledScriptTag('jobSequenceClient.ts'),
    content: html`
      <h1 class="visually-hidden">Job Sequence</h1>
      ${referrer
        ? html`
            <div class="row">
              <div class="col-12">
                <a class="btn btn-primary mb-4" href="${referrer}">
                  <i class="fa fa-arrow-left" aria-hidden="true"></i>
                  Back to previous page
                </a>
              </div>
            </div>
          `
        : ''}
      ${JobSequenceResults({ course: resLocals.course, jobSequence: job_sequence })}
    `,
  });
}
