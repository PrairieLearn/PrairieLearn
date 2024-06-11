import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Assessment, GroupConfig, User } from '../../lib/db-types.js';

export function StudentAssessment({ resLocals }: { resLocals: Record<string, any> }) {
  const { assessment_set, assessment, course, authz_result, user, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('studentAssessmentClient.js')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${assessment_set.abbreviation}${assessment.number}: ${assessment.title}
              ${assessment.group_work ? html`<i class="fas fa-users"></i>` : ''}
            </div>

            <div class="card-body">
              ${authz_result.mode === 'Exam' || authz_result.password != null
                ? html`
                    <p class="lead text-center">
                      Please wait until instructed to start by a proctor
                    </p>
                  `
                : ''}

              <p class="lead text-center">
                This is
                <strong>${assessment_set.name} ${assessment.number}: ${assessment.title}</strong>
                for <strong>${course.short_name}</strong>
              </p>

              ${authz_result.time_limit_min != null
                ? html`
                    <p class="lead text-center">
                      The time limit for this assessment is
                      <strong>
                        ${authz_result.time_limit_min}
                        ${authz_result.time_limit_min === 1 ? 'minute' : 'minutes'}
                      </strong>
                    </p>
                  `
                : ''}
              ${assessment.group_work
                ? StudentGroupControls({ resLocals })
                : StartAssessmentForm({ assessment, user, __csrf_token, startAllowed: true })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
function StartAssessmentForm({
  assessment,
  user,
  __csrf_token,
  startAllowed,
}: {
  assessment: Assessment;
  user: User;
  __csrf_token: string;
  startAllowed: boolean;
}) {
  return html`
    ${startAllowed && assessment.type === 'Exam' && assessment.require_honor_code
      ? HonorPledge({ user, groupWork: !!assessment.group_work })
      : ''}
    <form
      id="confirm-form"
      name="confirm-form"
      method="POST"
      class="mt-4 d-flex justify-content-center"
    >
      <input type="hidden" name="__action" value="new_instance" />
      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
      <button
        id="start-assessment"
        type="submit"
        class="btn btn-primary"
        ${(assessment.type === 'Exam' && assessment.require_honor_code) || !startAllowed
          ? 'disabled'
          : ''}
      >
        Start assessment
      </button>
    </form>
  `;
}

function HonorPledge({ user, groupWork }: { user: User; groupWork: boolean }) {
  return html`
    <div class="card card-secondary mb-4 test-class-honor-code">
      <ul class="list-group list-group-flush">
        <li class="list-group-item py-2">
          I certify that I am ${user.name} and ${groupWork ? 'our group is' : 'I am'} allowed to
          take this assessment.
        </li>
        <li class="list-group-item py-2">
          ${groupWork ? 'We' : 'I'} pledge on ${groupWork ? 'our' : 'my'} honor that
          ${groupWork ? 'we' : 'I'} will not give or receive any unauthorized assistance on this
          assessment and that all work will be ${groupWork ? 'our' : 'my'} own.
        </li>
      </ul>

      <div class="card-footer text-center border-top-0 py-2">
        <span class="form-check d-inline">
          <input type="checkbox" class="form-check-input" id="certify-pledge" />
          <label class="form-check-label font-weight-bold" for="certify-pledge">
            I certify and pledge the above.
          </label>
        </span>
      </div>
    </div>
  `;
}

function StudentGroupControls({ resLocals }: { resLocals: Record<string, any> }) {
  const { groupSize, groupConfig, startAllowed, user, __csrf_token, notInGroup, assessment } =
    resLocals;
  if (notInGroup) {
    return GroupCreationJoinForm({ groupConfig, __csrf_token });
  }

  return html`
    ${renderEjs(
      import.meta.url,
      "<%- include('../partials/groupWorkInfoContainer.ejs'); %>",
      resLocals,
    )}
    ${StartAssessmentForm({ assessment, user, __csrf_token, startAllowed })}
    ${groupConfig.minimum - groupSize > 0
      ? html`
          <p class="text-center">
            * Minimum group size is ${groupConfig.minimum}. You need at least
            ${groupConfig.minimum - groupSize} more group member(s) to start.
          </p>
        `
      : ''}
  `;
}

function GroupCreationJoinForm({
  groupConfig,
  __csrf_token,
}: {
  groupConfig: GroupConfig;
  __csrf_token: string;
}) {
  if (!groupConfig.student_authz_join && !groupConfig.student_authz_create) {
    return html`
      <p class="text-center">
        This is a group assessment. Please wait for the instructor to assign groups.
      </p>
    `;
  }

  return html`
    <p class="text-center">
      ${(groupConfig.minimum ?? 0) > 1
        ? html`
            This is a group assessment. A group must have
            ${groupConfig.maximum != null
              ? `between ${groupConfig.minimum} and ${groupConfig.maximum}`
              : `at least ${groupConfig.minimum}`}
            students.
          `
        : html`
            This assessment can be done individually or in groups.
            ${groupConfig.maximum
              ? `A group must have no more than ${groupConfig.maximum} students.`
              : ''}
            <br />To work individually, you must also create a group, but you don't need to share
            your join code.
          `}
    </p>
    <div class="container-fluid">
      <div class="row">
        ${groupConfig.student_authz_create
          ? html`
              <div class="col-sm bg-light py-4 px-4 border">
                <form id="create-form" name="create-form" method="POST">
                  <h6>Group name</h6>
                  <input
                    type="text"
                    class="form-control"
                    id="groupNameInput"
                    name="groupName"
                    maxlength="30"
                    placeholder="e.g. teamOne"
                    aria-describedby="groupNameHelp"
                  />
                  <small id="groupNameHelp" class="form-text text-muted">
                    Group names can only contain letters and numbers, with maximum length of 30
                    characters.
                  </small>
                  <div class="mt-4 d-flex justify-content-center">
                    <div class="form-group mb-0">
                      <input type="hidden" name="__action" value="create_group" />
                      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                      <button type="submit" class="btn btn-primary">Create new group</button>
                    </div>
                  </div>
                </form>
              </div>
            `
          : ''}
        ${groupConfig.student_authz_join
          ? html`
              <div class="col-sm bg-light py-4 px-4 border">
                <form id="joingroup-form" name="joingroup-form" method="POST">
                  <h6>Join code</h6>
                  <input
                    type="text"
                    class="form-control"
                    id="joinCodeInput"
                    name="join_code"
                    placeholder="abcd-1234"
                  />
                  <div class="mt-4 d-flex justify-content-center">
                    <div class="form-group mb-0">
                      <input type="hidden" name="__action" value="join_group" />
                      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                      <button type="submit" class="btn btn-primary">Join group</button>
                    </div>
                  </div>
                </form>
              </div>
            `
          : ''}
      </div>
    </div>
  `;
}
