import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { JobStatus } from '../../components/JobStatus.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types.js';

export const RegradingJobSequenceSchema = z.object({
  job_sequence: JobSequenceSchema,
  start_date_formatted: z.string(),
  user_uid: UserSchema.shape.uid,
});
type RegradingJobSequence = z.infer<typeof RegradingJobSequenceSchema>;

export function InstructorAssessmentRegrading({
  resLocals,
  regradingJobSequences,
}: {
  resLocals: Record<string, any>;
  regradingJobSequences: RegradingJobSequence[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Regrading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'regrading',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${resLocals.authz_data.has_course_instance_permission_edit
        ? html`
            ${regradeAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            })}
          `
        : ''}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Regrading</h1>
        </div>

        ${resLocals.authz_data.has_course_instance_permission_edit
          ? html`
              <div class="card-body">
                <p>
                  <button
                    type="button"
                    class="btn btn-primary"
                    data-bs-toggle="modal"
                    data-bs-target="#regrade-all-form"
                  >
                    <i class="fa fa-sync" aria-hidden="true"></i>
                    Regrade all assessment instances
                  </button>
                </p>
                <p class="small">
                  To regrade assessment instances for specific students, use the "Action" dropdown
                  on the
                  <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/instances">
                    assessment instances page</a
                  >.
                </p>
              </div>
            `
          : ''}

        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Regrading job history">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Description</th>
                <th>User</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${regradingJobSequences.length > 0
                ? regradingJobSequences.map((jobSequence) => {
                    return html`
                      <tr>
                        <td>${jobSequence.job_sequence.number}</td>
                        <td>${jobSequence.start_date_formatted}</td>
                        <td>${jobSequence.job_sequence.description}</td>
                        <td>${jobSequence.user_uid}</td>
                        <td>${JobStatus({ status: jobSequence.job_sequence.status })}</td>
                        <td>
                          <a
                            href="${resLocals.urlPrefix}/jobSequence/${jobSequence.job_sequence.id}"
                            class="btn btn-xs btn-info"
                          >
                            Details
                          </a>
                        </td>
                      </tr>
                    `;
                  })
                : html`
                    <tr>
                      <td colspan="6">No previous regradings.</td>
                    </tr>
                  `}
            </tbody>
          </table>
        </div>
      </div>
    `,
  });
}

function regradeAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: string;
  csrfToken: string;
}) {
  return Modal({
    id: 'regrade-all-form',
    title: 'Regrade all assessment instances',
    body: html`
      Are you sure you want to regrade all assessment instances for
      <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="regrade_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Regrade all</button>
    `,
  });
}
