import { EncodedData } from '@prairielearn/browser-utils';
import { html, type HtmlSafeString } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag, nodeModulesAssetPath } from '../lib/assets.js';
import { type CourseInstance } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { type QuestionsPageData } from '../models/questions.js';

import { Modal } from './Modal.html.js';

export function QuestionsTableHead() {
  // Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
  // from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way
  return html`
    <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
    <script src="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.js',
      )}"></script>
    <script src="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
      )}"></script>

    ${compiledScriptTag('instructorQuestionsClient.ts')}
    ${compiledStylesheetTag('questionsTable.css')}
  `;
}

export function QuestionsTable({
  questions,
  templateQuestions = [],
  showAddQuestionButton = false,
  showAiGenerateQuestionButton = false,
  showSharingSets = false,
  current_course_instance,
  course_instances = [],
  qidPrefix,
  urlPrefix,
  plainUrlPrefix,
  __csrf_token,
}: {
  questions: QuestionsPageData[];
  /**
   * The template questions the user can select as a starting point when creating a new question.
   */
  templateQuestions?: { qid: string; title: string }[];
  showAddQuestionButton?: boolean;
  showAiGenerateQuestionButton?: boolean;
  showSharingSets?: boolean;
  current_course_instance?: CourseInstance;
  course_instances?: CourseInstance[];
  qidPrefix?: string;
  urlPrefix: string;
  plainUrlPrefix: string;
  __csrf_token: string;
}): HtmlSafeString {
  const has_legacy_questions = questions.some((row) => row.display_type !== 'v3');
  const course_instance_ids = (course_instances || []).map((course_instance) => course_instance.id);
  return html`
    ${EncodedData(
      {
        course_instance_ids,
        showAddQuestionButton,
        showAiGenerateQuestionButton,
        qidPrefix,
        urlPrefix,
        plainUrlPrefix,
      },
      'questions-table-data',
    )}
    ${CreateQuestionModal({
      csrfToken: __csrf_token,
      templateQuestions,
    })}
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Questions</h1>
      </div>

      ${questions.length > 0
        ? html`
            <form class="ml-1 btn-group" name="add-question-form" method="POST">
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
              <input type="hidden" name="__action" value="add_question" />
            </form>

            <table
              id="questionsTable"
              aria-label="Questions"
              data-data="${JSON.stringify(questions)}"
              data-classes="table table-sm table-hover table-bordered"
              data-thead-classes="thead-light"
              data-filter-control="true"
              data-show-columns="true"
              data-show-columns-toggle-all="true"
              data-show-button-text="true"
              data-pagination="true"
              data-pagination-v-align="both"
              data-pagination-h-align="left"
              data-pagination-detail-h-align="right"
              data-page-list="[10,20,50,100,200,500,unlimited]"
              data-page-size="50"
              data-smart-display="false"
              data-show-extended-pagination="true"
              data-toolbar=".fixed-table-pagination:nth(0)"
              data-sticky-header="true"
            >
              <thead>
                <tr>
                  <th
                    data-field="qid"
                    data-sortable="true"
                    data-class="align-middle sticky-column"
                    data-formatter="qidFormatter"
                    data-filter-control="input"
                    data-filter-custom-search="genericFilterSearch"
                    data-switchable="true"
                  >
                    QID
                  </th>
                  <th
                    data-field="title"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-filter-control="input"
                    data-switchable="true"
                  >
                    Title
                  </th>
                  <th
                    data-field="topic"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-formatter="topicFormatter"
                    data-sorter="topicSorter"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Topics)"
                    data-filter-data="func:topicList"
                    data-filter-custom-search="badgeFilterSearch"
                    data-switchable="true"
                  >
                    Topic
                  </th>
                  <th
                    data-field="tags"
                    data-sortable="false"
                    data-class="align-middle text-nowrap"
                    data-formatter="tagsFormatter"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Tags)"
                    data-filter-data="func:tagsList"
                    data-filter-custom-search="badgeFilterSearch"
                    data-switchable="true"
                  >
                    Tags
                  </th>
                  ${showSharingSets
                    ? html` <th
                        data-field="sharing_sets"
                        data-sortable="false"
                        data-class="align-middle text-nowrap"
                        data-formatter="sharingSetFormatter"
                        data-filter-control="select"
                        data-filter-control-placeholder="(All)"
                        data-filter-data="func:sharingSetsList"
                        data-filter-custom-search="badgeFilterSearch"
                        data-switchable="true"
                        data-visible="false"
                      >
                        Sharing
                      </th>`
                    : ''}
                  <th
                    data-field="display_type"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-formatter="versionFormatter"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Versions)"
                    data-filter-data="func:versionList"
                    data-filter-custom-search="badgeFilterSearch"
                    data-visible="${has_legacy_questions}"
                    data-switchable="true"
                  >
                    Version
                  </th>
                  <th
                    data-field="grading_method"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Methods)"
                    data-visible="false"
                    data-switchable="true"
                  >
                    Grading Method
                  </th>
                  <th
                    data-field="external_grading_image"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Images)"
                    data-visible="false"
                    data-switchable="true"
                  >
                    External Grading Image
                  </th>
                  ${(course_instances || []).map(
                    (course_instance) =>
                      html` <th
                        data-field="assessments_${course_instance.id}"
                        data-class="align-middle text-nowrap"
                        data-formatter="assessments${course_instance.id}Formatter"
                        data-filter-control="select"
                        data-filter-control-placeholder="(All Assessments)"
                        data-filter-data="func:assessments${course_instance.id}List"
                        data-filter-custom-search="badgeFilterSearch"
                        data-visible="${current_course_instance &&
                        idsEqual(current_course_instance.id, course_instance.id)}"
                        data-switchable="true"
                      >
                        ${course_instance.short_name} Assessments
                      </th>`,
                  )}
                </tr>
              </thead>
            </table>
          `
        : html`
            <div class="my-4 card-body text-center" style="text-wrap: balance;">
              <p class="font-weight-bold">No questions found.</p>
              <p class="mb-0">
                A question is a problem or task that tests a student's understanding of a specific
                concept.
              </p>
              <p>
                Learn more in the
                <a href="https://prairielearn.readthedocs.io/en/latest/question/" target="_blank"
                  >question documentation</a
                >.
              </p>
              <form class="ml-1 btn-group" method="POST">
                <button class="btn btn-sm btn-primary">
                  <i class="fa fa-plus" aria-hidden="true"></i>
                  <span>Add question</span>
                </button>
              </form>
            </div>
          `}
    </div>
  `;
}

function CreateQuestionModal({
  csrfToken,
  templateQuestions,
}: {
  csrfToken: string;
  templateQuestions: { qid: string; title: string }[];
}) {
  return Modal({
    id: 'createQuestionModal',
    title: 'Create question',
    formMethod: 'POST',
    body: html`
      <div class="form-group">
        <label for="title">Title</label>
        <input
          type="text"
          class="form-control"
          id="title"
          name="title"
          required
          aria-describedby="title_help"
        />
        <small id="title_help" class="form-text text-muted">
          The full name of the question, visible to users.
        </small>
      </div>
      <div class="form-group">
        <label for="qid">Question identifier (QID)</label>
        <input
          type="text"
          class="form-control"
          id="qid"
          name="qid"
          required
          pattern="[\\-A-Za-z0-9_\\/]+"
          aria-describedby="qid_help"
        />
        <small id="qid_help" class="form-text text-muted">
          A short unique identifier for this question, such as "add-vectors" or "find-derivative".
          Use only letters, numbers, dashes, and underscores, with no spaces.
        </small>
      </div>
      <div class="form-group">
        <label for="start_from">Start from</label>
        <select
          class="form-select"
          id="start_from"
          name="start_from"
          required
          aria-describedby="start_from_help"
        >
          <option value="Empty question">Empty question</option>
          <option value="Template">Template</option>
        </select>
        <small id="start_from_help" class="form-text text-muted">
          Begin with an empty question or a pre-made question template.
        </small>
      </div>

      <div id="templateContainer" class="form-group" hidden>
        <label for="template_qid">Template</label>
        <select
          class="form-select"
          id="template_qid"
          name="template_qid"
          required
          aria-describedby="template_help"
          disabled
        >
          ${templateQuestions.map(
            (question) => html`<option value="${question.qid}">${question.title}</option>`,
          )}
        </select>
        <small id="template_help" class="form-text text-muted">
          The question will be created from this template.
        </small>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    `,
  });
}
