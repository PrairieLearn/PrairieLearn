import { z } from 'zod';

import { type HtmlValue, escapeHtml, html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { QuestionSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TagDescription } from '../../components/TagDescription.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { TopicDescription } from '../../components/TopicDescription.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import {
  AssessmentSchema,
  AssessmentSetSchema,
  IdSchema,
  type Question,
  type Tag,
  type Topic,
} from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { renderHtml } from '../../lib/preact-html.js';
import { encodePath } from '../../lib/uri-util.js';
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
  courseTopics,
  courseTags,
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
  courseTopics: Topic[];
  courseTags: Tag[];
}) {
  // Only show assessments on which this question is used when viewing the question
  // in the context of a course instance.
  const shouldShowAssessmentsList = !!resLocals.course_instance;
  const selectedTags = new Set(resLocals.tags?.map((tag) => tag.name) ?? []);

  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'question',
      subPage: 'settings',
    },
    options: {
      pageNote: resLocals.question.qid,
    },
    headContent: html`
      ${compiledScriptTag('instructorQuestionSettingsClient.ts')}
      <style>
        .ts-wrapper.multi .ts-control > span {
          cursor: pointer;
        }

        .ts-wrapper.multi .ts-control > span.active {
          background-color: var(--bs-primary) !important;
          color: white !important;
        }
      </style>
      <link
        href="${nodeModulesAssetPath('tom-select/dist/css/tom-select.bootstrap5.css')}"
        rel="stylesheet"
      />
    `,
    content: html`
      ${renderHtml(
        <QuestionSyncErrorsAndWarnings
          authz_data={resLocals.authz_data}
          question={resLocals.question}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>Question Settings</h1>
        </div>
        <div class="card-body">
          <form name="edit-question-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="mb-3">
              <label class="form-label" for="qid">QID</label>
              ${questionGHLink
                ? html`<a target="_blank" href="${questionGHLink}">view on GitHub</a>`
                : ''}
              <input
                type="text"
                class="form-control font-monospace"
                id="qid"
                name="qid"
                value="${resLocals.question.qid}"
                pattern="[\\-A-Za-z0-9_\\/]+"
                data-other-values="${qids.join(',')}"
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted">
                This is a unique identifier for the question, e.g. "addNumbers". Use only letters,
                numbers, dashes, and underscores, with no spaces. You may use forward slashes to
                separate directories.
              </small>
            </div>
            <div class="mb-3">
              <h2 class="h4">General</h2>
              <label class="form-label" for="title">Title</label>
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
            <div class="table-responsive card mb-3 overflow-visible">
              <table
                class="table two-column-description"
                aria-label="Question topic, tags, and assessments"
              >
                <tbody>
                  <tr>
                    <th class="align-middle">
                      <label id="topic-label" for="topic">Topic</label>
                    </th>
                    <!-- The style attribute is necessary until we upgrade to Bootstrap 5.3 -->
                    <!-- This is used by tom-select to style the active item in the dropdown -->
                    <td style="--bs-tertiary-bg: #f8f9fa">
                      ${canEdit
                        ? html`
                            <select
                              id="topic"
                              name="topic"
                              placeholder="Select a topic"
                              aria-labelledby="topic-label"
                            >
                              ${courseTopics.map((topic) => {
                                return html`
                                  <option
                                    value="${topic.name}"
                                    data-color="${topic.color}"
                                    data-name="${topic.name}"
                                    data-description="${topic.implicit
                                      ? ''
                                      : TopicDescription(topic)}"
                                    ${topic.name === resLocals.topic.name ? 'selected' : ''}
                                  ></option>
                                `;
                              })}
                            </select>
                          `
                        : TopicBadge(resLocals.topic)}
                    </td>
                  </tr>
                  <tr>
                    <th class="align-middle">
                      <label id="tags-label" for="tags">Tags</label>
                    </th>
                    <td>
                      ${canEdit
                        ? html`
                            <select
                              id="tags"
                              name="tags"
                              placeholder="Select tags"
                              aria-labelledby="tags-label"
                              multiple
                            >
                              ${courseTags.length > 0
                                ? courseTags.map((tag) => {
                                    return html`
                                      <option
                                        value="${tag.name}"
                                        data-color="${tag.color}"
                                        data-name="${tag.name}"
                                        data-description="${tag.implicit
                                          ? ''
                                          : TagDescription(tag)}"
                                        ${selectedTags.has(tag.name) ? 'selected' : ''}
                                      ></option>
                                    `;
                                  })
                                : ''}
                            </select>
                          `
                        : TagBadgeList(resLocals.tags)}
                    </td>
                  </tr>
                  ${shouldShowAssessmentsList
                    ? html`<tr>
                        <th class="align-middle">Assessments</th>
                        <td>${AssessmentBadges({ assessmentsWithQuestion, resLocals })}</td>
                      </tr>`
                    : ''}
                </tbody>
              </table>
            </div>
            <div class="mb-3">
              <label class="form-label" for="grading_method">Grading method</label>
              <select
                class="form-select"
                id="grading_method"
                name="grading_method"
                ${canEdit ? '' : 'disabled'}
              >
                <option
                  value="Internal"
                  ${resLocals.question.grading_method === 'Internal' ? 'selected' : ''}
                >
                  Internal
                </option>
                <option
                  value="External"
                  ${resLocals.question.grading_method === 'External' ? 'selected' : ''}
                >
                  External
                </option>
                <option
                  value="Manual"
                  ${resLocals.question.grading_method === 'Manual' ? 'selected' : ''}
                >
                  Manual
                </option>
              </select>
              <small class="form-text text-muted">
                The grading method used for this question.
              </small>
            </div>
            <div class="mb-3 form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="single_variant"
                name="single_variant"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.question.single_variant ? 'checked' : ''}
              />
              <label class="form-check-label" for="single_variant">Single variant</label>
              <div class="small text-muted">
                If enabled, students will only be able to try a single variant of this question on
                any given assessment.
              </div>
            </div>
            <div class="mb-3 form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="show_correct_answer"
                name="show_correct_answer"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.question.show_correct_answer ? 'checked' : ''}
              />
              <label class="form-check-label" for="show_correct_answer">Show correct answer</label>
              <div class="small text-muted">
                If enabled, the correct answer panel will be shown after all submission attempts
                have been exhausted.
              </div>
            </div>
            <div class="d-flex align-items-center mb-3">
              <h2 class="h4 mb-0 me-2">Workspace</h2>
              <button
                class="btn btn-sm btn-light"
                type="button"
                id="show-workspace-options-button"
                ${resLocals.question.workspace_image ? 'hidden' : ''}
              >
                Configure workspace
              </button>
            </div>
            <div id="workspace-options" ${resLocals.question.workspace_image ? '' : 'hidden'}>
              <div class="mb-3">
                <label class="form-label" for="workspace_image">Image</label>
                <input
                  type="text"
                  class="form-control"
                  id="workspace_image"
                  name="workspace_image"
                  value="${resLocals.question.workspace_image}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  The Docker image that will be used to serve this workspace. Only images from the
                  Dockerhub registry are supported.
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label" for="workspace_port">Port</label>
                <input
                  type="number"
                  class="form-control"
                  id="workspace_port"
                  name="workspace_port"
                  value="${resLocals.question.workspace_port}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  The port number used in the Docker image.
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label" for="workspace_home">Home</label>
                <input
                  type="text"
                  class="form-control"
                  id="workspace_home"
                  name="workspace_home"
                  value="${resLocals.question.workspace_home}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  The home directory of the workspace container.
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label" for="workspace_graded_files">Graded files</label>
                <input
                  type="text"
                  class="form-control"
                  id="workspace_graded_files"
                  name="workspace_graded_files"
                  value="${resLocals.question.workspace_graded_files?.join(', ')}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  The list of files or directories that will be copied out of the workspace
                  container when saving a submission. You may enter multiple files or directories,
                  separated by commas.
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label" for="workspace_args">Arguments</label>
                <input
                  class="form-control"
                  type="text"
                  id="workspace_args"
                  name="workspace_args"
                  ${canEdit ? '' : 'disabled'}
                  value="${resLocals.question.workspace_args}"
                />
                <small class="form-text text-muted">
                  Command line arguments to pass to the Docker container. Multiple arguments should
                  be separated by spaces and escaped as necessary using the same format as a typical
                  shell.
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label" for="workspace_environment">Environment</label>
                <textarea
                  class="form-control"
                  id="workspace_environment"
                  name="workspace_environment"
                  ${canEdit ? '' : 'disabled'}
                >
${Object.keys(resLocals.question.workspace_environment).length > 0 &&
                  typeof resLocals.question.workspace_environment === 'object'
                    ? JSON.stringify(resLocals.question.workspace_environment, null, 2)
                    : '{}'}</textarea
                >
                <small class="form-text text-muted">
                  Environment variables to set inside the workspace container. Variables must be
                  specified as a JSON object (e.g. <code>{"key":"value"}</code>).
                </small>
              </div>
              <div class="mb-3 form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="workspace_enable_networking"
                  name="workspace_enable_networking"
                  ${canEdit ? '' : 'disabled'}
                  ${resLocals.question.workspace_enable_networking ? 'checked' : ''}
                />
                <label class="form-check-label" for="workspace_enable_networking">
                  Enable networking
                </label>
                <div class="small text-muted">
                  Whether the workspace should have network access. Access is disabled by default.
                </div>
              </div>
              <div class="mb-3 form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="workspace_rewrite_url"
                  name="workspace_rewrite_url"
                  ${canEdit ? '' : 'disabled'}
                  ${resLocals.question.workspace_url_rewrite ? 'checked' : ''}
                />
                <label class="form-check-label" for="workspace_rewrite_url">Rewrite URL</label>
                <div class="small text-muted">
                  If enabled, the URL will be rewritten such that the workspace container will see
                  all requests as originating from "/".
                </div>
              </div>
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
                      question: resLocals.question,
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
                      .id}/file_edit/${encodePath(infoPath)}"
                    >Edit question configuration</a
                  >
                  in <code>info.json</code>
                `
              : html`
                  <hr />
                  <a
                    href="${resLocals.urlPrefix}/question/${resLocals.question
                      .id}/file_view/${encodePath(infoPath)}"
                  >
                    View question configuration
                  </a>
                  in <code>info.json</code>
                `
            : ''}
        </div>
        ${(editableCourses.length > 0 && resLocals.authz_data.has_course_permission_view) || canEdit
          ? html`
              <div class="card-footer">
                ${editableCourses.length > 0 &&
                resLocals.authz_data.has_course_permission_view &&
                resLocals.question.course_id === resLocals.course.id
                  ? html`
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        id="copyQuestionButton"
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title="Copy this question"
                        data-bs-content="${escapeHtml(
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
                  : ''}
                ${canEdit
                  ? html`
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        data-bs-toggle="modal"
                        data-bs-target="#deleteQuestionModal"
                      >
                        <i class="fa fa-times" aria-hidden="true"></i> Delete this question
                      </button>
                      ${DeleteQuestionModal({
                        qid: resLocals.question.qid,
                        assessmentsWithQuestion,
                        csrfToken: resLocals.__csrf_token,
                      })}
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>
    `,
  });
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
      <div class="mb-3">
        <label class="form-label" for="to-course-id-select">
          The copied question will be added to the following course:
        </label>
        <select class="form-select" id="to-course-id-select" name="to_course_id" required>
          ${editableCourses.map((c) => {
            return html`
              <option value="${c.id}" ${idsEqual(c.id, courseId) ? 'selected' : ''}>
                ${c.short_name}
              </option>
            `;
          })}
        </select>
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
                    <div class="h6">${a_with_q.short_name} (${a_with_q.long_name})</div>
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
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
      <button
        type="submit"
        class="btn btn-sm btn-outline-primary"
        name="__action"
        value="test_once"
      >
        Test once with full details
      </button>
      <button type="submit" class="btn btn-sm btn-outline-primary" name="__action" value="test_100">
        Test 100 times with only results
      </button>
    </form>
  `;
}

function QuestionSharing({
  question,
  sharingSetsIn,
}: {
  question: Question;
  sharingSetsIn: SharingSetRow[];
}) {
  if (!question.share_publicly && !question.share_source_publicly && sharingSetsIn.length === 0) {
    return html`<p>This question is not being shared.</p>`;
  }

  const details: HtmlValue[] = [];

  if (question.share_publicly) {
    details.push(html`
      <p>
        <span class="badge color-green3 me-1">Public</span>
        This question is publicly shared and can be imported by other courses.
      </p>
    `);
  }

  if (question.share_source_publicly) {
    details.push(html`
      <p>
        <span class="badge color-green3 me-1">Public source</span>
        This question's source is publicly shared.
      </p>
    `);
  }

  if (sharingSetsIn.length > 0) {
    const sharedWithLabel =
      sharingSetsIn.length === 1 ? '1 sharing set' : `${sharingSetsIn.length} sharing sets`;

    details.push(html`
      <p>
        Shared with ${sharedWithLabel}:
        ${sharingSetsIn.map((sharing_set) => {
          return html` <span class="badge color-gray1">${sharing_set.name}</span> `;
        })}
      </p>
    `);
  }

  return details;
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
        class="btn btn-badge color-${assessment.color}"
      >
        ${assessment.label}
      </a>
    `;
  });
}
