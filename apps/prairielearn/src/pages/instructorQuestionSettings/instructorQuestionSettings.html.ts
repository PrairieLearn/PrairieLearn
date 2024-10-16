import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { QuestionSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import { AssessmentSchema, AssessmentSetSchema, IdSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { type CourseWithPermissions } from '../../models/course.js';

export const SelectedAssessmentsSchema = z.object({
  short_name: z.string(),
  long_name: z.string(),
  course_instance_id: IdSchema,
  assessments: z.array(
    z.object({
      assessment_id: IdSchema,
      color: AssessmentSetSchema.shape.color,
      label: AssessmentSetSchema.shape.abbreviation,
      title: AssessmentSchema.shape.title,
      type: AssessmentSchema.shape.type,
    }),
  ),
});
type SelectedAssessments = z.infer<typeof SelectedAssessmentsSchema>;

export const SharingSetRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  in_set: z.boolean(),
});
type SharingSetRow = z.infer<typeof SharingSetRowSchema>;

export function InstructorQuestionSettings({
  resLocals,
  questionTestPath,
  questionTestCsrfToken,
  questionGHLink,
  qids,
  assessmentsWithQuestion,
  sharingEnabled,
  sharingSetsIn,
  editableCourses,
  infoPath,
  origHash,
  canEdit,
}: {
  resLocals: Record<string, any>;
  questionTestPath: string;
  questionTestCsrfToken: string;
  questionGHLink: string | null;
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharingEnabled: boolean;
  sharingSetsIn: SharingSetRow[];
  editableCourses: CourseWithPermissions[];
  infoPath: string;
  origHash: string;
  canEdit: boolean;
}) {
  // Only show assessments on which this question is used when viewing the question
  // in the context of a course instance.
  const shouldShowAssessmentsList = !!resLocals.course_instance;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageNote: resLocals.question.qid })}
        ${compiledScriptTag('instructorQuestionSettingsClient.ts')}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          ${QuestionSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            question: resLocals.question,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              <h1>Question Settings</h1>
            </div>
            <div class="card-body">
              <form name="edit-question-settings-form" method="POST">
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <input type="hidden" name="orig_hash" value="${origHash}" />
                <div class="form-group">
                  <h2 class="h4">General</h2>
                  <label for="title">Title</label>
                  <input
                    type="text"
                    class="form-control"
                    id="title"
                    name="title"
                    value="${resLocals.question.title}"
                    ${canEdit ? '' : 'disabled'}
                  />
                  <small class="form-text text-muted">
                    The title of the question (e.g., "Add two numbers").
                  </small>
                </div>
                <div class="form-group">
                  <label for="qid">QID</label>
                  ${questionGHLink
                    ? html`<a target="_blank" href="${questionGHLink}"> view on GitHub </a>`
                    : ''}
                  <input
                    type="text"
                    class="form-control"
                    id="qid"
                    name="qid"
                    value="${resLocals.question.qid}"
                    pattern="[\\-A-Za-z0-9_\\/]+"
                    data-other-values="${qids.join(',')}"
                    ${canEdit ? '' : 'disabled'}
                  />
                  <small class="form-text text-muted">
                    This is a unique identifier for the question, e.g. "addNumbers". Use only
                    letters, numbers, dashes, and underscores, with no spaces. You may use forward
                    slashes to separate directories.
                  </small>
                </div>

                <div class="table-responsive card mb-3">
                  <table
                    class="table two-column-description"
                    aria-label="Question topic, tags, and assessments"
                  >
                    <tr>
                      <th class="border-top-0">Topic</th>
                      <td class="border-top-0">${TopicBadge(resLocals.topic)}</td>
                    </tr>
                    <tr>
                      <th>Tags</th>
                      <td>${TagBadgeList(resLocals.tags)}</td>
                    </tr>
                    ${shouldShowAssessmentsList
                      ? html`<tr>
                          <th>Assessments</th>
                          <td>${AssessmentBadges({ assessmentsWithQuestion, resLocals })}</td>
                        </tr>`
                      : ''}
                  </table>
                </div>
                ${canEdit
                  ? html`
                      <button
                        id="save-button"
                        type="submit"
                        class="btn btn-primary mb-2"
                        name="__action"
                        value="update_question"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary mb-2"
                        onclick="window.location.reload()"
                      >
                        Cancel
                      </button>
                    `
                  : ''}
              </form>
              ${sharingEnabled
                ? html`
                    <hr />
                    <div>
                      <h2 class="h4">Sharing</h2>
                      <div data-testid="shared-with">
                        ${QuestionSharing({
                          questionSharedPublicly: resLocals.question.shared_publicly,
                          sharingSetsIn,
                        })}
                      </div>
                    </div>
                  `
                : ''}
              ${resLocals.question.type === 'Freeform' &&
              resLocals.question.grading_method !== 'External' &&
              resLocals.authz_data.has_course_permission_view
                ? html`
                    <hr />
                    <div>
                      <h2 class="h4">Tests</h2>
                      <div>
                        ${QuestionTestsForm({
                          questionTestPath,
                          questionTestCsrfToken,
                        })}
                      </div>
                    </div>
                  `
                : ''}
              ${resLocals.authz_data.has_course_permission_view
                ? canEdit
                  ? html`
                      <hr />
                      <a
                        data-testid="edit-question-configuration-link"
                        href="${resLocals.urlPrefix}/question/${resLocals.question
                          .id}/file_edit/${infoPath}"
                      >
                        Edit question configuration
                      </a>
                      in <code>info.json</code>
                    `
                  : html`
                      <hr />
                      <a
                        href="${resLocals.urlPrefix}/question/${resLocals.question
                          .id}/file_view/${infoPath}"
                      >
                        View question configuration
                      </a>
                      in <code>info.json</code>
                    `
                : ''}
            </div>
            ${(editableCourses.length > 0 && resLocals.authz_data.has_course_permission_view) ||
            canEdit
              ? html`
                  <div class="card-footer">
                      ${
                        editableCourses.length > 0 &&
                        resLocals.authz_data.has_course_permission_view &&
                        resLocals.question.course_id === resLocals.course.id
                          ? html`
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
                                    editableCourses,
                                    courseId: resLocals.course.id,
                                  }),
                                )}"
                              >
                                <i class="fa fa-clone"></i>
                                <span>Make a copy of this question</span>
                              </button>
                            `
                          : ''
                      }
                      ${
                        canEdit
                          ? html`
                              <button
                                class="btn btn-sm btn-primary"
                                id
                                href="#"
                                data-toggle="modal"
                                data-target="#deleteQuestionModal"
                              >
                                <i class="fa fa-times" aria-hidden="true"></i> Delete this question
                              </button>
                              ${DeleteQuestionModal({
                                qid: resLocals.question.qid,
                                assessmentsWithQuestion,
                                csrfToken: resLocals.__csrf_token,
                              })}
                            `
                          : ''
                      }
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
  editableCourses,
  courseId,
}: {
  csrfToken: string;
  editableCourses: CourseWithPermissions[];
  courseId: string;
}) {
  return html`
    <form name="copy-question-form" method="POST">
      <input type="hidden" name="__action" value="copy_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="form-group">
        <label for="to-course-id-select">
          The copied question will be added to the following course:
        </label>
        <select class="custom-select" id="to-course-id-select" name="to_course_id" required>
          ${editableCourses.map((c) => {
            return html`
              <option value="${c.id}" ${idsEqual(c.id, courseId) ? 'selected' : ''}>
                ${c.short_name}
              </option>
            `;
          })}
        </select>
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit</button>
      </div>
    </form>
  `;
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
    id: 'deleteQuestionModal',
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
                    <h6>${a_with_q.short_name} (${a_with_q.long_name})</h6>
                    ${a_with_q.assessments.map((assessment) =>
                      AssessmentBadge({
                        plainUrlPrefix: config.urlPrefix,
                        course_instance_id: a_with_q.course_instance_id,
                        assessment,
                      }),
                    )}
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

function QuestionTestsForm({
  questionTestPath,
  questionTestCsrfToken,
}: {
  questionTestPath: string;
  questionTestCsrfToken: string;
}) {
  return html`
    <form name="question-tests-form" method="POST" action="${questionTestPath}">
      <input type="hidden" name="__csrf_token" value="${questionTestCsrfToken}" />
      <button class="btn btn-sm btn-outline-primary" name="__action" value="test_once">
        Test once with full details
      </button>
      <button class="btn btn-sm btn-outline-primary" name="__action" value="test_100">
        Test 100 times with only results
      </button>
    </form>
  `;
}

function QuestionSharing({
  questionSharedPublicly,
  sharingSetsIn,
}: {
  questionSharedPublicly: boolean;
  sharingSetsIn: SharingSetRow[];
}) {
  if (questionSharedPublicly) {
    return html`
      <p>
        <span class="badge color-green3 mr-1">Public</span>
        This question is publicly shared.
      </p>
    `;
  }

  const sharedWithLabel =
    sharingSetsIn.length === 1 ? '1 sharing set' : `${sharingSetsIn.length} sharing sets`;

  return html`
    ${sharingSetsIn.length === 0
      ? html`<p>This question is not being shared.</p>`
      : html`
          <p>
            Shared with ${sharedWithLabel}:
            ${sharingSetsIn.map((sharing_set) => {
              return html` <span class="badge color-gray1">${sharing_set.name}</span> `;
            })}
          </p>
        `}
  `;
}

function AssessmentBadges({
  assessmentsWithQuestion,
  resLocals,
}: {
  assessmentsWithQuestion: SelectedAssessments[];
  resLocals: Record<string, any>;
}) {
  const courseInstanceId = resLocals.course_instance.id;

  const assessmentsInCourseInstance = assessmentsWithQuestion.find((a) =>
    idsEqual(a.course_instance_id, courseInstanceId),
  );

  if (
    !assessmentsInCourseInstance?.assessments ||
    assessmentsInCourseInstance.assessments.length === 0
  ) {
    return html`
      <small class="text-muted text-center">
        This question is not included in any assessments in this course instance.
      </small>
    `;
  }

  return assessmentsInCourseInstance.assessments.map((assessment) => {
    return html`
      <a
        href="/pl/course_instance/${assessmentsInCourseInstance.course_instance_id}/instructor/assessment/${assessment.assessment_id}"
        class="badge color-${assessment.color}"
      >
        ${assessment.label}
      </a>
    `;
  });
}
