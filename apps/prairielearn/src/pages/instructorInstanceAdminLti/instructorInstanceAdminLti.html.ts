import { escapeHtml, html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { config } from '../../lib/config.js';
import type { LtiCredentials, User } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';

export function InstructorInstanceAdminLti({ resLocals }: { resLocals: Record<string, any> }) {
  const {
    authz_data,
    course_owners,
    lti_credentials,
    __csrf_token: csrfToken,
    lti_links,
    assessments,
    course_instance: courseInstance,
    course,
    urlPrefix,
  } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI' })}
      </head>
      <body>
        <script>
          function copyToClipboard(element) {
            var $temp = $('<input>');
            $('body').append($temp);
            $temp.val($(element).text()).select();
            document.execCommand('copy');
            $temp.remove();
          }
        </script>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseInstanceSyncErrorsAndWarnings({ authz_data, courseInstance, course, urlPrefix })}
          ${!authz_data.has_course_permission_edit
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-danger text-white">
                    <h1>LTI configuration</h1>
                  </div>
                  <div class="card-body">
                    <h2>Insufficient permissions</h2>
                    <p>You must have at least &quot;Editor&quot; permissions for this course.</p>
                    ${course_owners.length > 0
                      ? html`
                          <p>Contact one of the below course owners to request access.</p>
                          <ul>
                            ${course_owners.map(
                              (owner: User) => html`
                                <li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li>
                              `,
                            )}
                          </ul>
                        `
                      : ''}
                  </div>
                </div>
              `
            : html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">
                    <h1>LTI configuration</h1>
                  </div>
                  <div class="card-body">
                    <p>
                      The LTI (Learning Tools Interoperability) standard allows other online
                      learning websites to embed PrairieLearn assessments within them. PrairieLearn
                      acts as a <em>Tool Provider</em> for LTI. See the
                      <a href="https://www.imsglobal.org/basic-overview-how-lti-works">
                        LTI overview
                      </a>
                      for more information.
                    </p>
                    <p>
                      <strong>
                        This version of LTI is deprecated. Check with PrairieLearn admins before
                        enabling to ensure it is appropriate for your course.
                      </strong>
                    </p>
                    ${!config.hasLti ? html`<p><em>LTI not enabled on this server.</em></p>` : ''}
                  </div>
                </div>

                ${config.hasLti
                  ? html`
                      ${LtiCredentialsCard({ lti_credentials, csrfToken })}
                      ${LtiLinkTargetsCard({ lti_links, assessments, csrfToken })}
                    `
                  : ''}
              `}
        </main>
      </body>
    </html>
  `.toString();
}

function LtiCredentialsCard({
  lti_credentials,
  csrfToken,
}: {
  lti_credentials: (Omit<LtiCredentials, 'deleted_at'> & {
    created: string | null;
    deleted: string | null;
  })[];
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
                      <i
                        class="far fa-copy"
                        title="Copy to clipboard"
                        onClick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                      ></i>
                    </td>
                    <td>
                      <code>${tc.consumer_key}</code>
                      <i
                        class="far fa-copy"
                        title="Copy to clipboard"
                        onClick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                      ></i>
                    </td>
                    <td>
                      <code>${tc.secret}</code>
                      <i
                        class="far fa-copy"
                        title="Copy to clipboard"
                        onClick="copyToClipboard($(this).prev());$(this).fadeOut({queue: true});$(this).fadeIn({queue:true});"
                      ></i>
                    </td>
                    <td>${tc.created}</td>
                    <td>
                      ${tc.deleted ||
                      html`
                        <button
                          type="button"
                          class="btn btn-sm btn-danger"
                          data-toggle="popover"
                          data-container="body"
                          data-html="true"
                          data-placement="auto"
                          title="Confirm delete"
                          data-content="${escapeHtml(html`
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

      <div class="card-body">
        <form method="post">
          <input type="hidden" name="__action" value="lti_new_cred" />
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="submit" class="btn btn-success" value="Create new LTI credential" />
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
  lti_links: {
    id: string;
    resource_link_title: string | null;
    resource_link_description: string | null;
    assessment_id: string | null;
    created: string | null;
  }[];
  assessments: {
    assessment_id: string;
    label: string;
    title: string | null;
    tid: string | null;
  }[];
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
                          class="custom-select"
                          onChange="this.form.submit();"
                          name="newAssessment"
                        >
                          <option value="" ${!link.assessment_id ? 'selected' : ''}>-- None</option>
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
  `;
}
