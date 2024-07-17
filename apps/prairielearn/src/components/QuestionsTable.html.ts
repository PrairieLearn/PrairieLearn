import { EncodedData } from '@prairielearn/browser-utils';
import { html, HtmlSafeString } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag } from '../lib/assets.js';
import type { CourseInstance } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';
import type { QuestionsPageDataAnsified } from '../models/questions.js';

import type { EncodedQuestionsData } from './QuestionsTable.types.js';

export function QuestionsTableHead() {
  // Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
  // from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way
  return html`
    ${compiledScriptTag('instructorQuestionsClient.ts')}
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
  plainUrlPrefix,
  __csrf_token,
}: {
  questions: QuestionsPageDataAnsified[];
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
  const course_instances_client_data = (course_instances || []).map((course_instance) => ({
    id: course_instance.id.toString(),
    short_name: course_instance.short_name,
    current:
      current_course_instance != null && idsEqual(current_course_instance.id, course_instance.id),
  }));
  return html`
    ${EncodedData<EncodedQuestionsData>(
      {
        course_instances: course_instances_client_data,
        urlPrefix,
        plainUrlPrefix,
        questions,
        showSharingSets,
        qidPrefix,
      },
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
      <div class="m-2 row">
        <div class="btn-group ml-auto">
          <div class="btn-group dropdown">
            <button
              class="btn btn-secondary dropdown-toggle"
              data-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <i class="fas fa-th-list"></i> Columns
            </button>
            <div class="dropdown-menu js-column-visibility"></div>
          </div>
          <button class="btn btn-secondary js-clear-filters-btn">
            <i class="fas fa-times"></i> Clear filters
          </button>
          ${showAddQuestionButton
            ? html`<form class="btn-group" name="add-question-form" method="POST">
                <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                <input type="hidden" name="__action" value="add_question" />
                <button type="submit" class="btn btn-secondary">
                  <i class="fas fa-plus"></i> Add Question
                </button>
              </form>`
            : ''}
          ${showAiGenerateQuestionButton
            ? html`
                <a class="btn btn-secondary" href="${urlPrefix}/ai_generate_question">
                  <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
                  Generate Question with AI
                </a>
              `
            : ''}
        </div>
      </div>
      <div id="questionsTable" class="table table-sm table-bordered mb-0 border-0">
        <div class="spinner-border" role="status">
          <span class="sr-only">Loading...</span>
        </div>
      </div>
    </div>
  `;
}
