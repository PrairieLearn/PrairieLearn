import { EncodedData } from '@prairielearn/browser-utils';
import { type HtmlSafeString, html } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag, nodeModulesAssetPath } from '../lib/assets.js';
import { getAiQuestionGenerationDraftsUrl } from '../lib/client/url.js';
import { type CourseInstance } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import { type QuestionsPageData } from '../models/questions.js';

import type { QuestionsTableData } from './QuestionsTable.types.js';

export function QuestionsTableHead() {
  // Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
  // from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way

  return html`
    <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
    <script src="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
      )}"></script>

    ${compiledScriptTag('instructorQuestionsClient.ts')}
    ${compiledScriptTag('bootstrap-table-sticky-header.js')}
    ${compiledStylesheetTag('questionsTable.css')}
  `;
}

export function QuestionsTable({
  questions,
  showAddQuestionButton = false,
  showAiGenerateQuestionButton = false,
  showSharingSets = false,
  current_course_instance,
  course_instances = [],
  qidPrefix,
  urlPrefix,
}: {
  questions: QuestionsPageData[];
  showAddQuestionButton?: boolean;
  showAiGenerateQuestionButton?: boolean;
  showSharingSets?: boolean;
  current_course_instance?: CourseInstance;
  course_instances?: CourseInstance[];
  qidPrefix?: string;
  urlPrefix: string;
}): HtmlSafeString {
  const has_legacy_questions = questions.some((row) => row.display_type !== 'v3');
  const course_instance_ids = course_instances.map((course_instance) => course_instance.id);
  return html`
    ${EncodedData<QuestionsTableData>(
      {
        course_instance_ids,
        showAddQuestionButton,
        showAiGenerateQuestionButton,
        qidPrefix,
        urlPrefix,
      },
      'questions-table-data',
    )}
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Questions</h1>
      </div>

      ${questions.length > 0
        ? html`
            <table
              id="questionsTable"
              aria-label="Questions"
              data-data="${JSON.stringify(questions)}"
              data-classes="table table-sm table-hover table-bordered"
              data-thead-classes="table-light"
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
                    data-filter-data="func:externalGradingImageList"
                    data-visible="false"
                    data-switchable="true"
                  >
                    External Grading Image
                  </th>
                  <th
                    data-field="workspace_image"
                    data-sortable="true"
                    data-class="align-middle text-nowrap"
                    data-filter-control="select"
                    data-filter-control-placeholder="(All Images)"
                    data-filter-data="func:workspaceImageList"
                    data-visible="false"
                    data-switchable="true"
                  >
                    Workspace Image
                  </th>
                  ${course_instances.map(
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
              <p class="fw-bold">No questions found.</p>
              <p class="mb-0">
                A question is a problem or task that tests a student's understanding of a specific
                concept.
              </p>
              <p>
                Learn more in the
                <a href="https://docs.prairielearn.com/question/" target="_blank" rel="noreferrer"
                  >question documentation</a
                >.
              </p>
              ${showAddQuestionButton
                ? html`
                    <div class="d-flex flex-row flex-wrap justify-content-center gap-3">
                      <a
                        class="btn btn-sm btn-primary"
                        href="${urlPrefix}/course_admin/questions/create"
                      >
                        <i class="fa fa-plus" aria-hidden="true"></i>
                        Add question
                      </a>
                      ${showAiGenerateQuestionButton
                        ? html`
                            <a
                              class="btn btn-sm btn-primary"
                              href="${getAiQuestionGenerationDraftsUrl({ urlPrefix })}"
                            >
                              <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
                              Generate question with AI
                            </a>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `}
    </div>
  `;
}
