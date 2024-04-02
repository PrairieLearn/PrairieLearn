import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { Modal } from '../../components/Modal.html';
import { IdSchema } from '../../lib/db-types';
import { CourseWithPermissions } from '../../models/course';
import { isEnterprise } from '../../lib/license';

export const SelectedAssessmentsSchema = z.object({
  title: z.string(),
  course_instance_id: IdSchema,
  assessments: z.array(
    z.object({
      assessment_id: IdSchema,
      color: z.string(),
      label: z.string(),
    }),
  ),
});
type SelectedAssessments = z.infer<typeof SelectedAssessmentsSchema>;

export const SharingSetSchema = z.object({
  id: IdSchema,
  name: z.string(),
  in_set: z.boolean(),
});
type SharingSet = z.infer<typeof SharingSetSchema>;

export function InstructorQuestionSettings({
  resLocals,
  questionTestPath,
  questionTestCsrfToken,
  questionGHLink,
  qids,
  assessmentsWithQuestion,
  sharingEnabled,
  sharingSetsIn,
  sharingSetsOther,
  editableCourses,
  infoPath,
}: {
  resLocals: Record<string, any>;
  questionTestPath: string;
  questionTestCsrfToken: string;
  questionGHLink: string | null;
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharingEnabled: boolean;
  sharingSetsIn: SharingSet[];
  sharingSetsOther: SharingSet[];
  editableCourses: CourseWithPermissions[];
  infoPath: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          pageNote: resLocals.question.qid,
          ...resLocals,
        })}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({
              sanitize: false,
            });
          });
        </script>

        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/questionSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              Question ${resLocals.question.qid}
            </div>

            <table class="table table-sm two-column-description">
              <tbody>
                <tr>
                  <th>Title</th>
                  <td>${resLocals.question.title}</td>
                </tr>
                <tr>
                  <th>QID</th>
                  <td>
                    <span class="mr-2">${resLocals.question.qid}</span>
                    ${resLocals.authz_data.has_course_permission_edit &&
                    !resLocals.course.example_course
                      ? html`
                          <button
                            type="button"
                            class="btn btn-xs btn-secondary mr-2"
                            id="changeQidButton"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Change QID"
                            data-content="${renderEjs(
                              __filename,
                              "<%= include('../partials/changeIdForm') %>",
                              {
                                id_label: 'QID',
                                buttonID: 'changeQidButton',
                                id_old: resLocals.question.qid,
                                ids: qids,
                                ...resLocals,
                              },
                            )}"
                            data-trigger="click"
                          >
                            <i class="fa fa-i-cursor"></i>
                            <span>Change QID</span>
                          </button>
                        `
                      : ''}
                    ${questionGHLink
                      ? html`<a target="_blank" href="${questionGHLink}"> view on GitHub </a>`
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Configuration</th>
                  <td>
                    ${resLocals.authz_data.has_course_permission_view
                      ? html`
                          <a
                            href="${resLocals.urlPrefix}/question/${resLocals.question
                              .id}/file_view/${infoPath}"
                          >
                            info.json
                          </a>
                          ${resLocals.authz_data.has_course_permission_edit &&
                          !resLocals.course.example_course
                            ? html`
                                <a
                                  class="btn btn-xs btn-secondary mx-2"
                                  href="${resLocals.urlPrefix}/question/${resLocals.question
                                    .id}/file_edit/${infoPath}"
                                >
                                  <i class="fa fa-edit"></i>
                                  <span>Edit</span>
                                </a>
                              `
                            : ''}
                        `
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Type</th>
                  <td>${resLocals.question.type}</td>
                </tr>
                <tr>
                  <th>Topic</th>
                  <td>
                    ${renderEjs(__filename, "<%- include('../partials/topic') %>", {
                      topic: resLocals.topic,
                    })}
                  </td>
                </tr>
                <tr>
                  <th>Tags</th>
                  <td>
                    ${renderEjs(__filename, "<%- include('../partials/tags') %>", {
                      tags: resLocals.tags,
                    })}
                  </td>
                </tr>
                <tr>
                  <th>Issues</th>
                  <td>
                    ${renderEjs(__filename, "<%- include('../partials/issueBadge') %>", {
                      count: resLocals.open_issue_count,
                      issueQid: resLocals.question.qid,
                      suppressLink: resLocals.suppressLink,
                      urlPrefix: resLocals.urlPrefix,
                    })}
                  </td>
                </tr>
                <tr>
                  <th>Assessments</th>
                  <td>
                    ${resLocals.assessments
                      ? renderEjs(__filename, "<%- include('../partials/assessments') %>", {
                          assessments: resLocals.assessments,
                          urlPrefix: resLocals.urlPrefix,
                        })
                      : ''}
                  </td>
                </tr>
                ${sharingEnabled
                  ? html`
                      <tr>
                        <th class="align-middle">Sharing</th>
                        <td data-testid="shared-with">
                          ${resLocals.question.shared_publicly
                            ? html`<div class="badge color-green3">Public</div>
                                This question is publicly shared.`
                            : html`
                                ${sharingSetsIn.length === 0
                                  ? html`Not Shared`
                                  : html`
                                      Shared With:
                                      ${sharingSetsIn.map(function (sharing_set) {
                                        return html`
                                          <span class="badge color-gray1">
                                            ${sharing_set?.name}
                                          </span>
                                        `;
                                      })}
                                    `}
                                ${resLocals.authz_data.has_course_permission_own
                                  ? html`
                                      ${sharingSetsOther.length > 0
                                        ? html`
                                            <form
                                              name="sharing-set-add"
                                              method="POST"
                                              class="d-inline"
                                            >
                                              <input
                                                type="hidden"
                                                name="__action"
                                                value="sharing_set_add"
                                              />
                                              <input
                                                type="hidden"
                                                name="__csrf_token"
                                                value="${resLocals.__csrf_token}"
                                              />
                                              <div class="btn-group btn-group-sm" role="group">
                                                <button
                                                  id="addSharingSet"
                                                  type="button"
                                                  class="btn btn-sm btn-outline-dark dropdown-toggle"
                                                  data-toggle="dropdown"
                                                  aria-haspopup="true"
                                                  aria-expanded="false"
                                                >
                                                  Add...
                                                </button>
                                                <div
                                                  class="dropdown-menu"
                                                  aria-labelledby="addSharingSet"
                                                >
                                                  ${sharingSetsOther.map(function (sharing_set) {
                                                    return html`
                                                      <button
                                                        class="dropdown-item"
                                                        type="submit"
                                                        name="unsafe_sharing_set_id"
                                                        value="${sharing_set.id}"
                                                      >
                                                        ${sharing_set.name}
                                                      </button>
                                                    `;
                                                  })}
                                                </div>
                                              </div>
                                            </form>
                                          `
                                        : ''}
                                      <button
                                        class="btn btn-sm btn-outline-primary"
                                        type="button"
                                        data-toggle="modal"
                                        data-target="#publiclyShareModal"
                                      >
                                        Share Publicly
                                      </button>
                                      ${PubliclyShareModal({
                                        csrfToken: resLocals.__csrf_token,
                                        qid: resLocals.question.qid,
                                      })}
                                    `
                                  : ''}
                              `}
                        </td>
                      </tr>
                    `
                  : ''}
                ${resLocals.question.type === 'Freeform' &&
                resLocals.question.grading_method !== 'External' &&
                resLocals.authz_data.has_course_permission_view
                  ? html`
                      <tr>
                        <th class="align-middle">Tests</th>
                        <td>
                          <form
                            name="question-tests-form"
                            method="POST"
                            action="${questionTestPath}"
                          >
                            <input
                              type="hidden"
                              name="__csrf_token"
                              value="${questionTestCsrfToken}"
                            />
                            <button
                              class="btn btn-sm btn-outline-primary"
                              name="__action"
                              value="test_once"
                            >
                              Test once with full details
                            </button>
                            <button
                              class="btn btn-sm btn-outline-primary"
                              name="__action"
                              value="test_100"
                            >
                              Test 100 times with only results
                            </button>
                          </form>
                        </td>
                      </tr>
                    `
                  : ''}
              </tbody>
            </table>
            ${(editableCourses.length > 0 && resLocals.authz_data.has_course_permission_view) ||
            (resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course)
              ? html`
                  <div class="card-footer">
                    <div class="row">
                      ${editableCourses.length > 0 &&
                      resLocals.authz_data.has_course_permission_view &&
                      resLocals.question.course_id === resLocals.course.id
                        ? html`
                            <div class="col-auto">
                              <button
                                type="button"
                                class="btn btn-sm btn-primary"
                                id="copyQuestionButton"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Copy this question"
                                data-content="${escapeHtml(
                                  CopyForm({
                                    csrfToken: resLocals.__csrf_token,
                                    exampleCourse: resLocals.course.example_course,
                                    editableCourses,
                                    courseId: resLocals.course.id,
                                    buttonId: 'copyQuestionButton',
                                  }),
                                )}"
                                data-trigger="manual"
                                onclick="$(this).popover('show')"
                              >
                                <i class="fa fa-clone"></i>
                                <span>Make a copy of this question</span>
                              </button>
                            </div>
                          `
                        : ''}
                      ${resLocals.authz_data.has_course_permission_edit &&
                      !resLocals.course.example_course
                        ? html`
                            <div class="col-auto">
                              <button
                                class="btn btn-sm btn-primary"
                                id
                                href="#"
                                data-toggle="modal"
                                data-target="#delete-question-form"
                              >
                                <i class="fa fa-times" aria-hidden="true"></i> Delete this question
                              </button>
                            </div>
                            ${DeleteQuestionModal({
                              qid: resLocals.question.qid,
                              assessmentsWithQuestion,
                              csrfToken: resLocals.__csrf_token,
                            })}
                          `
                        : ''}
                    </div>
                  </div>
                `
              : ''}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function CopyForm({
  csrfToken,
  exampleCourse,
  editableCourses,
  courseId,
  buttonId,
}: {
  csrfToken: string;
  exampleCourse: boolean;
  editableCourses: CourseWithPermissions[];
  courseId: string;
  buttonId: string;
}) {
  return html`
    <form name="copy-question-form" class="needs-validation" method="POST" novalidate>
      <input type="hidden" name="__action" value="copy_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="form-group">
        <label for="to-course-id-select">
          The copied question will be added to the following course:
        </label>
        <select class="form-control" id="to-course-id-select" name="to_course_id" required>
          ${exampleCourse
            ? html`<option hidden disabled selected value>-- select a course --</option>`
            : ''}
          ${editableCourses.map((c) => {
            return html`
              <option value="${c.id}" ${c.id === courseId ? 'selected' : ''}>
                ${c.short_name}
              </option>
            `;
          })}
        </select>
        <div class="invalid-feedback" id="invalidIdMessage"></div>
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${buttonId}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Submit</button>
      </div>
    </form>

    <script>
      $(function () {
        const validateCourse = function () {
          let element = $('select[name="to_course_id"]');
          let elementDOM = element.get(0);

          elementDOM.setCustomValidity('');
          if (elementDOM.validity.valueMissing) {
            $('#invalidIdMessage').text('Please choose a course');
          } else {
            $('#invalidIdMessage').text('');
          }
        };

        $('input[name="to_course_id"]').on('input', validateCourse);
        $('input[name="to_course_id"]').on('change', validateCourse);

        $('form[name="copy-question-form"]').submit(function (event) {
          validateCourse();
          if ($(this).get(0).checkValidity() === false) {
            event.preventDefault();
            event.stopPropagation();
          }
          $(this).addClass('was-validated');
        });
      });
    </script>
  `;
}

function PubliclyShareModal({ csrfToken, qid }: { csrfToken: string; qid: string }) {
  return Modal({
    id: 'publiclyShareModal',
    title: 'Confirm Publicly Share Question',
    body: html`
      <p>Are you sure you want to publicly share this question?</p>
      <p>
        Once this question is publicly shared, anyone will be able to view it or use it as a part of
        their course. This operation cannot be undone.
      </p>
      ${isEnterprise()
        ? html`
            <p>
              You retain full ownership of all shared content as described in the
              <a href="https://www.prairielearn.com/legal/terms#2-user-content" target="_blank"
                >Terms of Service</a
              >. To allow PrairieLearn to share your content to other users you agree to the
              <a
                href="https://www.prairielearn.com/legal/terms#3-user-content-license-grant"
                target="_blank"
                >User Content License Grant</a
              >.
            </p>
          `
        : ''}
    `,
    footer: html`
      <input type="hidden" name="__action" value="share_publicly" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button class="btn btn-primary" type="submit">Publicly Share "${qid}"</button>
    `,
  });
}

function DeleteQuestionModal({
  qid,
  assessmentsWithQuestion,
  csrfToken,
}: {
  qid: string;
  assessmentsWithQuestion: SelectedAssessments[];
  csrfToken: string;
}) {
  return Modal({
    id: 'delete-question-form',
    title: 'Delete question',
    body: html`
      <p>
        Are you sure you want to delete the question
        <strong>${qid}</strong>?
      </p>
      ${assessmentsWithQuestion.length
        ? html`
            <p>It is included by these assessments:</p>
            <ul class="list-group my-4">
              ${assessmentsWithQuestion.map((a_with_q) => {
                return html`
                  <li class="list-group-item">
                    <h6>${a_with_q.title}</h6>
                    ${a_with_q.assessments.map(function (a) {
                      return html`
                        <a
                          href="/pl/course_instance/${a_with_q.course_instance_id}/instructor/assessment/${a.assessment_id}"
                          class="badge color-${a.color} color-hover"
                        >
                          ${a.label}
                        </a>
                      `;
                    })}
                  </li>
                `;
              })}
            </ul>
            <p>
              So, if you delete it, you will be unable to sync your course content to the database
              until you either remove the question from these assessments or create a new question
              with the same QID.
            </p>
          `
        : ''}
    `,
    footer: html`
      <input type="hidden" name="__action" value="delete_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete</button>
    `,
  });
}
