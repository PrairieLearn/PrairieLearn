import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QuestionShortNameDescription } from '../../components/ShortNameDescriptions.js';
import { TagBadgeList } from '../../components/TagBadge.js';
import { TagDescription } from '../../components/TagDescription.js';
import { TopicBadge } from '../../components/TopicBadge.js';
import { TopicDescription } from '../../components/TopicDescription.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { type Tag, type Topic } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SHORT_NAME_PATTERN } from '../../lib/short-name.js';
import { encodePath } from '../../lib/uri-util.js';
import { type CourseWithPermissions } from '../../models/course.js';

import { QuestionSettingsCardFooter } from './components/QuestionSettingsCardFooter.js';
import { QuestionSharing } from './components/QuestionSharing.js';
import { QuestionTestsForm } from './components/QuestionTestsForm.js';
import {
  EditableCourseSchema,
  type SelectedAssessments,
  SelectedAssessmentsSchema,
  type SharingSetRow,
} from './instructorQuestionSettings.types.js';

export function InstructorQuestionSettings({
  resLocals,
  questionTestPath,
  questionTestCsrfToken,
  questionGHLink,
  questionTags,
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
  resLocals: ResLocalsForPage<'instructor-question'>;
  questionTestPath: string;
  questionTestCsrfToken: string;
  questionGHLink: string | null;
  questionTags: Tag[];
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharingEnabled: boolean;
  sharingSetsIn: SharingSetRow[] | undefined;
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
  const questionTagNames = new Set(questionTags.map((tag) => tag.name));

  const canCopy =
    editableCourses.length > 0 &&
    resLocals.authz_data.has_course_permission_view &&
    resLocals.question.course_id === resLocals.course.id;

  const showFooter = canCopy || canEdit;

  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'question',
      subPage: 'settings',
    },
    options: {
      pageNote: resLocals.question.qid!,
    },
    headContent: html`
      ${compiledScriptTag('instructorQuestionSettingsClient.tsx')}
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
      <div class="card mb-4">
        <div
          class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
        >
          <h1>Question Settings</h1>
          ${renderHtml(<GitHubButton gitHubLink={questionGHLink} />)}
        </div>
        <div class="card-body">
          <form name="edit-question-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="mb-3">
              <label class="form-label" for="qid">QID</label>
              <input
                type="text"
                class="form-control font-monospace"
                id="qid"
                name="qid"
                value="${resLocals.question.qid}"
                pattern="${
                  // TODO: if/when this page is converted to React, use `validateShortName`
                  // from `../../lib/short-name.js` with react-hook-form to provide more specific
                  // validation feedback (e.g., "cannot start with a slash").
                  SHORT_NAME_PATTERN
                }|${
                  // NOTE: this will not be compatible with browsers, as it was only
                  // just added to modern browsers as of January 2025. If/when this
                  // page is converted to React, we should use a custom validation
                  // function instead of the `pattern` attribute to enforce this.
                  // @ts-expect-error -- https://github.com/microsoft/TypeScript/issues/61321
                  RegExp.escape(resLocals.question.qid)
                }"
                data-other-values="${qids.join(',')}"
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted">
                ${renderHtml(<QuestionShortNameDescription />)}
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
                    <td>
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
                                      : renderHtml(<TopicDescription topic={topic} />)}"
                                    ${topic.name === resLocals.topic.name ? 'selected' : ''}
                                  ></option>
                                `;
                              })}
                            </select>
                          `
                        : renderHtml(<TopicBadge topic={resLocals.topic} />)}
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
                                          : renderHtml(<TagDescription tag={tag} />)}"
                                        ${questionTagNames.has(tag.name) ? 'selected' : ''}
                                      ></option>
                                    `;
                                  })
                                : ''}
                            </select>
                          `
                        : renderHtml(<TagBadgeList tags={questionTags} />)}
                    </td>
                  </tr>
                  ${shouldShowAssessmentsList && resLocals.course_instance
                    ? html`<tr>
                        <th class="align-middle">Assessments</th>
                        <td>
                          ${renderHtml(
                            <AssessmentBadges
                              assessmentsWithQuestion={assessmentsWithQuestion}
                              courseInstanceId={resLocals.course_instance.id}
                            />,
                          )}
                        </td>
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
            <div class="d-flex align-items-center mb-3">
              <h2 class="h4 mb-0 me-2">External Grading</h2>
              <button
                class="btn btn-sm btn-light"
                type="button"
                id="show-external-grading-options-button"
                ${resLocals.question.external_grading_image ? 'hidden' : ''}
              >
                Configure external grading
              </button>
            </div>
            <div>
              <div
                id="external-grading-options"
                ${resLocals.question.external_grading_image ? '' : 'hidden'}
              >
                <div class="mb-3 form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="external_grading_enabled"
                    name="external_grading_enabled"
                    ${canEdit ? '' : 'disabled'}
                    ${resLocals.question.external_grading_enabled === true ? 'checked' : ''}
                  />
                  <label class="form-check-label" for="external_grading_enabled">Enabled</label>
                  <div class="small text-muted">
                    Whether the external grader is currently enabled. Useful for troubleshooting
                    external grader failures, for instance.
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="external_grading_image">Image</label>
                  <input
                    type="text"
                    class="form-control"
                    id="external_grading_image"
                    name="external_grading_image"
                    value="${resLocals.question.external_grading_image}"
                    ${canEdit ? '' : 'disabled'}
                  />
                  <small class="form-text text-muted">
                    The Docker image that will be used to grade this question. Only images from the
                    Dockerhub registry are supported.
                  </small>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="external_grading_entrypoint">Entrypoint</label>
                  <input
                    class="form-control"
                    type="text"
                    id="external_grading_entrypoint"
                    name="external_grading_entrypoint"
                    ${canEdit ? '' : 'disabled'}
                    value="${resLocals.question.external_grading_entrypoint}"
                  />
                  <small class="form-text text-muted">
                    Program or command to run as the entrypoint to your grader. If not provided, the
                    default entrypoint for the image will be used.
                  </small>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="external_grading_files">Server files</label>
                  <input
                    type="text"
                    class="form-control"
                    id="external_grading_files"
                    name="external_grading_files"
                    value="${resLocals.question.external_grading_files?.join(', ')}"
                    ${canEdit ? '' : 'disabled'}
                  />
                  <small class="form-text text-muted">
                    The list of files or directories that will be copied from
                    <code>course/serverFilesCourse</code> into the grading job. You may enter
                    multiple files or directories, separated by commas.
                  </small>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="external_grading_timeout">Timeout</label>
                  <input
                    type="number"
                    class="form-control"
                    id="external_grading_timeout"
                    name="external_grading_timeout"
                    min="0"
                    value="${resLocals.question.external_grading_timeout}"
                    ${canEdit ? '' : 'disabled'}
                  />
                  <small class="form-text text-muted">
                    The number of seconds after which the grading job will timeout.
                  </small>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="external_grading_environment">Environment</label>
                  <textarea
                    class="form-control"
                    id="external_grading_environment"
                    name="external_grading_environment"
                    ${canEdit ? '' : 'disabled'}
                  >
${Object.keys(resLocals.question.external_grading_environment).length > 0 &&
                    typeof resLocals.question.external_grading_environment === 'object'
                      ? JSON.stringify(resLocals.question.external_grading_environment, null, 2)
                      : '{}'}</textarea
                  >
                  <small class="form-text text-muted">
                    Environment variables to set inside the grading container. Variables must be
                    specified as a JSON object (e.g. <code>{"key":"value"}</code>).
                  </small>
                </div>
                <div class="mb-3 form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="external_grading_enable_networking"
                    name="external_grading_enable_networking"
                    ${canEdit ? '' : 'disabled'}
                    ${resLocals.question.external_grading_enable_networking ? 'checked' : ''}
                  />
                  <label class="form-check-label" for="external_grading_enable_networking">
                    Enable networking
                  </label>
                  <div class="small text-muted">
                    Whether the grading containers should have network access. Access is disabled by
                    default.
                  </div>
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
                    ${renderHtml(
                      <QuestionSharing
                        sharePublicly={resLocals.question.share_publicly}
                        shareSourcePublicly={resLocals.question.share_source_publicly}
                        sharingSetsIn={sharingSetsIn ?? []}
                      />,
                    )}
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
                    ${renderHtml(
                      <QuestionTestsForm
                        questionTestPath={questionTestPath}
                        csrfToken={questionTestCsrfToken}
                      />,
                    )}
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
        ${showFooter
          ? renderHtml(
              // TODO: Pass full course/question objects when the whole page is hydrated.
              <Hydrate>
                <QuestionSettingsCardFooter
                  canEdit={canEdit}
                  canCopy={canCopy}
                  editableCourses={z.array(EditableCourseSchema).parse(editableCourses)}
                  courseId={resLocals.course.id}
                  qid={resLocals.question.qid!}
                  assessmentsWithQuestion={z
                    .array(SelectedAssessmentsSchema)
                    .parse(assessmentsWithQuestion)}
                  csrfToken={resLocals.__csrf_token}
                />
              </Hydrate>,
            )
          : ''}
      </div>
    `,
  });
}

function AssessmentBadges({
  assessmentsWithQuestion,
  courseInstanceId,
}: {
  assessmentsWithQuestion: SelectedAssessments[];
  courseInstanceId: string;
}) {
  const assessmentsInCourseInstance = assessmentsWithQuestion.find((a) =>
    idsEqual(a.course_instance_id, courseInstanceId),
  );

  if (
    !assessmentsInCourseInstance?.assessments ||
    assessmentsInCourseInstance.assessments.length === 0
  ) {
    return (
      <small className="text-muted text-center">
        This question is not included in any assessments in this course instance.
      </small>
    );
  }

  return assessmentsInCourseInstance.assessments.map((assessment) => {
    return (
      <a
        key={assessment.assessment_id}
        href={`/pl/course_instance/${assessmentsInCourseInstance.course_instance_id}/instructor/assessment/${assessment.assessment_id}`}
        className={`btn btn-badge color-${assessment.color}`}
      >
        {assessment.label}
      </a>
    );
  });
}
