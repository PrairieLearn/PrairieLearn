import { html } from '@prairielearn/html';

import { HeadContents } from '../components/HeadContents.html.js';
import { Navbar } from '../components/Navbar.html.js';
import { Scorebar } from '../components/Scorebar.html.js';
import { TimeLimitExpiredModal } from '../components/TimeLimitExpiredModal.html.js';
import type { Assessment, AssessmentInstance, AssessmentSet } from '../lib/db-types.js';
import { formatPoints } from '../lib/format.js';

export function StudentAssessmentAccess({
  resLocals,
  showClosedScore = true,
  showTimeLimitExpiredModal = false,
}: {
  resLocals: Record<string, any>;
  showClosedScore?: boolean;
  showTimeLimitExpiredModal?: boolean;
}) {
  const { assessment, assessment_set, assessment_instance, authz_result } = resLocals as {
    assessment: Assessment;
    assessment_set: AssessmentSet;
    assessment_instance?: AssessmentInstance;
    authz_result: any;
  };
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'assessment_instance' })}
        ${showTimeLimitExpiredModal ? TimeLimitExpiredModal({ showAutomatically: true }) : ''}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${assessment_set.abbreviation}${assessment.number}: ${assessment.title}
            </div>

            <div class="card-body">
              ${assessment_instance != null &&
              (assessment_instance.open === false || authz_result.active === false) &&
              showClosedScore
                ? html`
                    <div class="row align-items-center">
                      <div class="col-md-3 col-sm-6">
                        Total points:
                        ${formatPoints(assessment_instance.points)}/${formatPoints(
                          assessment_instance.max_points,
                        )}
                      </div>
                      <div class="col-md-3 col-sm-6">
                        ${Scorebar(assessment_instance.score_perc)}
                      </div>

                      ${AssessmentStatusDescription({
                        assessment_instance,
                        authz_result,
                        extraClasses: 'col-md-6 col-sm-12 text-right',
                      })}
                    </div>
                  `
                : AssessmentStatusDescription({ assessment_instance, authz_result })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentStatusDescription({
  assessment_instance,
  authz_result,
  extraClasses = '',
}: {
  assessment_instance?: AssessmentInstance;
  authz_result: any;
  extraClasses?: string;
}) {
  return html`
    <div class="test-suite-assessment-closed-message ${extraClasses}">
      ${assessment_instance?.open === false
        ? html`Assessment is <strong>closed</strong> and is no longer available.`
        : authz_result.next_active_time == null
          ? html`Assessment is no longer available.`
          : html`Assessment will become available on ${authz_result.next_active_time}.`}
    </div>
  `;
}
