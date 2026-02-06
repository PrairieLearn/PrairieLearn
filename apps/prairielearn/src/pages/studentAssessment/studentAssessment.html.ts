import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html, unsafeHtml } from '@prairielearn/html';

import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.js';
import { PageLayout } from '../../components/PageLayout.js';
import { type Assessment, type GroupConfig, type User } from '../../lib/db-types.js';
import { type GroupInfo } from '../../lib/groups.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function StudentAssessment({
  resLocals,
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  customHonorCode,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  groupConfig?: GroupConfig;
  groupInfo?: GroupInfo | null;
  userCanAssignRoles?: boolean;
  customHonorCode: string;
}) {
  const { assessment_set, assessment, course, authz_result, user, __csrf_token } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: `${assessment_set.abbreviation}${assessment.number}: ${assessment.title}`,
    navContext: {
      type: 'student',
      page: 'assessment',
    },
    headContent: html`
      ${compiledScriptTag('studentAssessmentClient.ts')}
      <style>
        .honor-code :last-child {
          margin-bottom: 0;
        }
      </style>
    `,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>${assessment_set.abbreviation}${assessment.number}: ${assessment.title}</h1>
          ${assessment.team_work ? html`&nbsp;<i class="fas fa-users"></i>` : ''}
        </div>

        <div class="card-body">
          ${authz_result.mode === 'Exam' || authz_result.password != null
            ? html`
                <p class="lead text-center">Please wait until instructed to start by a proctor</p>
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
          ${assessment.team_work
            ? StudentGroupControls({ groupConfig, groupInfo, userCanAssignRoles, resLocals })
            : StartAssessmentForm({
                assessment,
                user,
                __csrf_token,
                startAllowed: true,
                customHonorCode,
              })}
        </div>
      </div>
    `,
  });
}

function StartAssessmentForm({
  assessment,
  user,
  __csrf_token,
  startAllowed,
  customHonorCode,
}: {
  assessment: Assessment;
  user: User;
  __csrf_token: string;
  startAllowed: boolean;
  customHonorCode?: string;
}) {
  return html`
    ${startAllowed && assessment.type === 'Exam' && assessment.require_honor_code
      ? HonorPledge({
          user,
          groupWork: !!assessment.team_work,
          customHonorCode,
        })
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

function HonorPledge({
  user,
  groupWork,
  customHonorCode,
}: {
  user: User;
  groupWork: boolean;
  customHonorCode?: string;
}) {
  return html`
    <div class="card card-secondary mb-4" data-testid="honor-code">
      ${customHonorCode
        ? html`<div class="px-3 py-2 honor-code">${unsafeHtml(customHonorCode)}</div>`
        : html`<ul class="list-group list-group-flush">
            <li class="list-group-item py-2">
              I certify that I am ${user.name} and ${groupWork ? 'our group is' : 'I am'} allowed to
              take this assessment.
            </li>
            <li class="list-group-item py-2">
              ${groupWork ? 'We' : 'I'} pledge on ${groupWork ? 'our' : 'my'} honor that
              ${groupWork ? 'we' : 'I'} will not give or receive any unauthorized assistance on this
              assessment and that all work will be ${groupWork ? 'our' : 'my'} own.
            </li>
          </ul>`}
      <div class="card-footer d-flex justify-content-center">
        <span class="form-check">
          <input type="checkbox" class="form-check-input" id="certify-pledge" />
          <label class="form-check-label fw-bold" for="certify-pledge">
            I certify and pledge the above.
          </label>
        </span>
      </div>
    </div>
  `;
}

function StudentGroupControls({
  groupConfig,
  groupInfo,
  userCanAssignRoles = false,
  resLocals,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  groupConfig?: GroupConfig;
  groupInfo?: GroupInfo | null;
  userCanAssignRoles?: boolean;
}) {
  if (groupConfig == null) return '';

  const { user, __csrf_token, assessment } = resLocals;
  if (groupInfo == null) {
    return GroupCreationJoinForm({ groupConfig, __csrf_token });
  }

  return html`
    ${GroupWorkInfoContainer({
      groupConfig,
      groupInfo,
      userCanAssignRoles,
      csrfToken: __csrf_token,
    })}
    ${StartAssessmentForm({ assessment, user, __csrf_token, startAllowed: groupInfo.start })}
    ${groupConfig.minimum != null && groupConfig.minimum - groupInfo.groupSize > 0
      ? html`
          <p class="text-center">
            * Minimum group size is ${groupConfig.minimum}. You need at least
            ${groupConfig.minimum - groupInfo.groupSize} more group member(s) to start.
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
                  ${groupConfig.student_authz_choose_name
                    ? html`
                        <label for="group-name-input">Group name</label>
                        <input
                          type="text"
                          class="form-control"
                          id="group-name-input"
                          name="group_name"
                          maxlength="30"
                          pattern="[a-zA-Z0-9]+"
                          placeholder="e.g. teamOne"
                          aria-label="Group name"
                          aria-describedby="group-name-help"
                        />
                        <small id="group-name-help" class="form-text text-muted">
                          Group names can only contain letters and numbers, with maximum length of
                          30 characters. If you leave this blank, a group name will be generated for
                          you.
                        </small>
                      `
                    : ''}
                  <div class="mt-4 d-flex justify-content-center">
                    <div class="mb-3">
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
                  <label for="join-code-input">Join code</label>
                  <input
                    type="text"
                    class="form-control"
                    id="join-code-input"
                    name="join_code"
                    placeholder="abcd-1234"
                    pattern="[a-zA-Z0-9]+-[0-9]{4}"
                    maxlength="35"
                    required
                  />
                  <div class="mt-4 d-flex justify-content-center">
                    <div class="mb-3">
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
