import { html, HtmlSafeString } from '@prairielearn/html';
import { EncodedData } from '@prairielearn/browser-utils';
import { type CourseInstance } from '../lib/db-types';
import { QuestionsPageDataAnsified } from '../models/questions';
import { nodeModulesAssetPath, compiledScriptTag, compiledStylesheetTag } from '../lib/assets';
import { idsEqual } from '../lib/id';

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
  showAddQuestionButton = false,
  showSharingSets = false,
  current_course_instance,
  course_instances = [],
  qidPrefix,
  urlPrefix,
  plainUrlPrefix,
  __csrf_token,
}: {
  questions: QuestionsPageDataAnsified[];
  showAddQuestionButton?: boolean;
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
      { course_instance_ids, showAddQuestionButton, qidPrefix, urlPrefix, plainUrlPrefix },
      'questions-table-data',
    )}

    <div class="card mb-4">
      <div class="card-header bg-primary">
        <div class="row align-items-center justify-content-between">
          <div class="col-auto">
            <span class="text-white">Questions</span>
          </div>
        </div>
      </div>

      <form class="ml-1 btn-group" name="add-question-form" method="POST">
        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
        <input type="hidden" name="__action" value="add_question" />
      </form>

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
    </div>
  `;
}
