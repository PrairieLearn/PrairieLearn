import { Hydrate } from '@prairielearn/react/server';

import { JobSequenceResults } from '../../components/JobSequenceResults.js';
import { getJobSequenceResultsProps } from '../../components/JobSequenceResults.types.js';
import { PageLayout } from '../../components/PageLayout.js';
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
  const clientProps = getJobSequenceResultsProps({
    course: resLocals.course,
    jobSequence: job_sequence,
  });

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
    content: (
      <>
        <h1 className="visually-hidden">Job Sequence</h1>
        {referrer && (
          <div className="row">
            <div className="col-12">
              <a className="btn btn-primary mb-4" href={referrer}>
                <i className="fa fa-arrow-left" aria-hidden="true" /> Back to previous page
              </a>
            </div>
          </div>
        )}
        <Hydrate>
          <JobSequenceResults
            authnUserUid={clientProps.authnUserUid}
            jobs={clientProps.jobs}
            jobSequence={clientProps.jobSequence}
            jobSequenceToken={clientProps.jobSequenceToken}
            timeZone={clientProps.timeZone}
            userUid={clientProps.userUid}
          />
        </Hydrate>
      </>
    ),
  });
}
