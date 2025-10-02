import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { config } from '../../lib/config.js';
import { AssessmentSchema, LtiCredentialSchema, LtiLinkSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { isEnterprise } from '../../lib/license.js';

export const LtiDataSchema = z.object({
  assessments: z
    .array(
      z.object({
        assessment_id: AssessmentSchema.shape.id,
        label: z.string(),
        title: AssessmentSchema.shape.title,
        tid: AssessmentSchema.shape.tid,
      }),
    )
    .nullable(),
  lti_credentials: z
    .array(
      z.object({
        ...LtiCredentialSchema.pick({
          id: true,
          course_instance_id: true,
          consumer_key: true,
          secret: true,
          created_at: true,
        }).shape,
        created: z.string(),
        deleted: z.string().nullable(),
      }),
    )
    .nullable(),
  lti_links: z
    .array(
      z.object({
        ...LtiLinkSchema.pick({
          id: true,
          resource_link_title: true,
          resource_link_description: true,
          assessment_id: true,
          created_at: true,
        }).shape,
        created: z.string(),
      }),
    )
    .nullable(),
});
type LtiData = z.infer<typeof LtiDataSchema>;

export function InstructorInstanceAdminLti({
  assessments,
  lti_credentials,
  lti_links,
  resLocals,
}: {
  assessments: LtiData['assessments'];
  lti_credentials: LtiData['lti_credentials'];
  lti_links: LtiData['lti_links'];
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'lti',
    },
    options: {
      fullWidth: true,
    },
    preContent: html`
      <script>
        function copyToClipboard(element) {
          var $temp = $('<input>');
          $('body').append($temp);
          $temp.val($(element).text()).select();
          document.execCommand('copy');
          $temp.remove();
        }
      </script>
    `,
    content: html`
      ${renderHtml(
        <CourseInstanceSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>LTI configuration</h1>
        </div>
        <div class="card-body">
          <p>
            The LTI (Learning Tools Interoperability) standard allows other online learning websites
            to embed PrairieLearn assessments within them. PrairieLearn acts as a
            <em>Tool Provider</em> for LTI. See the
            <a href="https://www.imsglobal.org/basic-overview-how-lti-works"> LTI overview </a>
            for more information.
          </p>
          <p>
            <strong>
              This version of LTI is deprecated.
              ${isEnterprise()
                ? html`See the "Integrations" tab for more information about newer integration
                  methods.`
                : html`Check with your PrairieLearn admins about newer integration methods.`}
            </strong>
          </p>
          ${!resLocals.lti11_enabled
            ? html`<p><em>LTI 1.1 is not enabled for this course instance.</em></p>`
            : ''}
        </div>
      </div>

      ${resLocals.lti11_enabled
        ? html`
            ${LtiCredentialCard({ lti_credentials, csrfToken: resLocals.__csrf_token })}
            ${LtiLinkTargetsCard({ lti_links, assessments, csrfToken: resLocals.__csrf_token })}
          `
        : ''}
    `,
  });
}

function LtiCredentialCard({
  lti_credentials,
  csrfToken,
}: {
  lti_credentials: LtiData['lti_credentials'];
  csrfToken: string;
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">LTI credentials</div>
      <div class="card-body">
        <p class="mb-0">
          Use these credentials with your LMS (Learning Management System) to connect into this
          course instance. A single credential can be shared with multiple links.
        </p>
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-hover" aria-label="LTI credentials">
          <thead>
            <tr>
              <th>Launch URL</th>
              <th>Consumer key</th>
              <th>Shared secret</th>
              <th>Created</th>
              <th>Deleted</th>
            </tr>
          </thead>
          <tbody>
            ${lti_credentials
              ? lti_credentials.map(
                  (tc) => html`
                    <tr>
                      <td>
                        <code>${config.ltiRedirectUrl}</code>
                        <button
                          type="button"
                          class="btn btn-sm btn-ghost"
                          aria-label="Copy redirect URL to clipboard"
                          onclick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                        >
                          <i class="far fa-copy"></i>
                        </button>
                      </td>
                      <td>
                        <code>${tc.consumer_key}</code>
                        <button
                          type="button"
                          class="btn btn-sm btn-ghost"
                          aria-label="Copy consumer key to clipboard"
                          onclick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                        >
                          <i class="far fa-copy"></i>
                        </button>
                      </td>
                      <td>
                        <code>${tc.secret}</code>
                        <button
                          type="button"
                          class="btn btn-sm btn-ghost"
                          aria-label="Copy shared secret to clipboard"
                          onclick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                        >
                          <i class="far fa-copy"></i>
                        </button>
                      </td>
                      <td>${tc.created}</td>
                      <td>
                        ${tc.deleted ||
                        html`
                          <button
                            type="button"
                            class="btn btn-sm btn-danger"
                            data-bs-toggle="popover"
                            data-bs-container="body"
                            data-bs-html="true"
                            data-bs-placement="auto"
                            data-bs-title="Confirm delete"
                            data-bs-content="${escapeHtml(html`
                              <form method="post">
                                <input type="hidden" name="__action" value="lti_del_cred" />
                                <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                                <input type="hidden" name="lti_link_id" value="${tc.id}" />
                                <input type="submit" class="btn btn-danger" value="Delete" />
                              </form>
                            `)}"
                          >
                            Delete
                          </button>
                        `}
                      </td>
                    </tr>
                  `,
                )
              : html`
                  <tr>
                    <td colspan="5">
                      <em>No LTI credentials have been created.</em>
                    </td>
                  </tr>
                `}
          </tbody>
        </table>
      </div>

      <div class="card-body">
        <form method="post">
          <input type="hidden" name="__action" value="lti_new_cred" />
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <button type="submit" class="btn btn-success">Create new LTI credential</button>
        </form>
      </div>
    </div>
  `;
}

function LtiLinkTargetsCard({
  lti_links,
  assessments,
  csrfToken,
}: {
  lti_links: LtiData['lti_links'];
  assessments: LtiData['assessments'];
  csrfToken: string;
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">LTI link targets</div>
      <div class="card-body">
        <p>
          LTI links connect an assessment from your LMS directly into a PrairieLearn assessment.
          This is required for PrairieLearn to update scores in your LMS.
        </p>
        <p class="mb-0">
          To create a link, first create and follow the link in your LMS, then configure it here.
        </p>
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-hover" aria-label="LTI link targets">
          <thead>
            <tr>
              <th>Link info</th>
              <th>Assessment</th>
              <th>Link first seen</th>
            </tr>
          </thead>
          <tbody>
            ${lti_links
              ? lti_links.map(
                  (link) => html`
                    <tr>
                      <td title="${link.resource_link_description}">${link.resource_link_title}</td>
                      <td>
                        <form method="post">
                          <input type="hidden" name="__action" value="lti_link_target" />
                          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                          <input type="hidden" name="lti_link_id" value="${link.id}" />
                          <select
                            class="form-select"
                            onchange="this.form.submit();"
                            name="newAssessment"
                          >
                            <option value="" ${!link.assessment_id ? 'selected' : ''}>
                              -- None
                            </option>
                            ${assessments?.map(
                              (a) => html`
                                <option
                                  value="${a.assessment_id}"
                                  ${link.assessment_id &&
                                  idsEqual(link.assessment_id, a.assessment_id)
                                    ? 'selected'
                                    : ''}
                                >
                                  ${a.label}: ${a.title} (${a.tid})
                                </option>
                              `,
                            )}
                          </select>
                        </form>
                      </td>
                      <td>${link.created}</td>
                    </tr>
                  `,
                )
              : html`
                  <tr>
                    <td colspan="3">
                      <em>No LTI links have been created.</em>
                    </td>
                  </tr>
                `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
