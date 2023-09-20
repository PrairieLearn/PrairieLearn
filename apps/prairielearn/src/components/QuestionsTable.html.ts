import { html, HtmlSafeString } from '@prairielearn/html';
import { nodeModulesAssetPath, compiledScriptTag } from '../lib/assets';

export function QuestionsTable(
  questions,
  current_course_instance,
  course_instances,
  errorMessage,
): HtmlSafeString {
  const has_legacy_questions = questions.some((row) => row.display_type !== 'v3');
  return html`
    <style>
      .sticky-column {
        position: sticky;
        left: 0;
        background: white;
        background-clip: padding-box;
        box-shadow: inset -1px 0 #dee2e6;
      }
      .table-hover tbody tr:hover td.sticky-column {
        color: #212529;
        background-color: #efefef;
      }
      .fixed-table-toolbar {
        padding: 0 1em 0 1em;
      }
      .fixed-table-toolbar div.pagination,
      .fixed-table-toolbar div.pagination-detail {
        margin: 0 1em 0 0 !important;
      }
    </style>

    <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
    <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
    <script src="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.js',
      )}"></script>
    <script src="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
      )}"></script>
    <link
      href="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.css')}"
      rel="stylesheet"
    />
    <link
      href="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.css',
      )}"
      rel="stylesheet"
    />
    <link
      href="${nodeModulesAssetPath(
        'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.css',
      )}"
      rel="stylesheet"
    />

    ${compiledScriptTag('questionsTable.js')}

    <main id="content" class="container-fluid">
      ${errorMessage}
      <div class="card mb-4">
        <div class="card-header bg-primary">
          <div class="row align-items-center justify-content-between">
            <div class="col-auto">
              <span class="text-white">Questions</span>
            </div>
          </div>
        </div>

        <table
          id="questionsTable"
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
                    current_course_instance.id === course_instance.id}"
                    data-switchable="true"
                  >
                    ${course_instance.short_name} Assessments
                  </th>`,
              )}
            </tr>
          </thead>
        </table>
      </div>
    </main>
  `;
}
