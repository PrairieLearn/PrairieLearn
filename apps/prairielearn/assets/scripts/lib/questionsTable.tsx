import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';
import { html, joinHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { AssessmentBadgeHtml } from '../../../src/components/AssessmentBadge.js';
import { SyncProblemButtonHtml } from '../../../src/components/SyncProblemButton.js';
import { TagBadgeList } from '../../../src/components/TagBadge.js';
import { TopicBadgeHtml } from '../../../src/components/TopicBadge.js';
import { type Topic } from '../../../src/lib/db-types.js';
import { type QuestionsPageData } from '../../../src/models/questions.js';

import { type ExtendedBootstrapTableOptions } from './bootstrapTable.js';

// Allows records like 'Prefix...Suffix'. If key extends `${P}${K}${S}`, allowed, otherwise never.
type PrefixSuffixObjectKeys<T extends Record<string, any>, P extends string, S extends string> = {
  [K in keyof T as K extends string ? `${P}${K}${S}` : never]: T[K];
};

type AssessmentGlobals = PrefixSuffixObjectKeys<Record<string, any>, 'assessments', 'Formatter'> &
  PrefixSuffixObjectKeys<Record<string, any>, 'assessments', 'List'>;

declare global {
  interface Window extends AssessmentGlobals {
    topicList: () => any;
    tagsList: () => any;
    sharingSetsList: () => any;
    versionList: () => any;
    qidFormatter: (_qid: any, question: QuestionsPageData) => any;
    topicFormatter: (_topic: any, question: QuestionsPageData) => any;
    tagsFormatter: (_tags: any, question: QuestionsPageData) => any;
    sharingSetFormatter: (_sharing_sets: any, question: QuestionsPageData) => any;
    versionFormatter: (_version: any, question: QuestionsPageData) => any;
    topicSorter: (topicA: Topic, topicB: Topic) => any;
    genericFilterSearch: (search: string, value: string) => any;
    badgeFilterSearch: (search: string, value: string) => any;
  }
}

onDocumentReady(() => {
  const {
    course_instance_ids,
    showAddQuestionButton,
    showAiGenerateQuestionButton,
    qidPrefix,
    urlPrefix,
    plainUrlPrefix,
  } = decodeData('questions-table-data');

  window.topicList = function () {
    const data = $('#questionsTable').bootstrapTable('getData') as QuestionsPageData[];
    return Object.fromEntries(data.map(({ topic }) => [topic.name, topic.name]));
  };

  window.tagsList = function () {
    const data = $('#questionsTable').bootstrapTable('getData') as QuestionsPageData[];
    return Object.fromEntries(
      data.flatMap((row) => row.tags ?? []).map(({ name }) => [name, name]),
    );
  };

  window.sharingSetsList = function () {
    const data = $('#questionsTable').bootstrapTable('getData') as QuestionsPageData[];
    const sharing_sets = Object.fromEntries(
      data.flatMap((row) => row.sharing_sets ?? []).map(({ name }) => [name, name]),
    );
    sharing_sets.Public = 'Public';
    sharing_sets['Public source'] = 'Public source';
    return sharing_sets;
  };

  window.versionList = function () {
    const data = $('#questionsTable').bootstrapTable('getData') as QuestionsPageData[];
    return Object.fromEntries(data.map(({ display_type }) => [display_type, display_type]));
  };

  window.qidFormatter = function (_qid: any, question: QuestionsPageData) {
    let text = '';
    if (question.sync_errors) {
      text += SyncProblemButtonHtml({
        type: 'error',
        output: question.sync_errors,
      }).toString();
    } else if (question.sync_warnings) {
      text += SyncProblemButtonHtml({
        type: 'warning',
        output: question.sync_warnings,
      }).toString();
    }

    // We only want to show the sharing name prefix for publicly-shared questions.
    // Those that only have their source shared publicly (and thus that are not
    // available to be imported by other courses) won't show the prefix.
    const prefix = qidPrefix && question.share_publicly ? qidPrefix : '';

    text += html`
      <a class="formatter-data" href="${urlPrefix}/question/${question.id}/preview">
        ${prefix}${question.qid}
      </a>
    `.toString();
    if (question.open_issue_count > 0) {
      text += html`<a
        class="badge rounded-pill text-bg-danger ms-1"
        href="${urlPrefix}/course_admin/issues?q=is%3Aopen+qid%3A${encodeURIComponent(
          question.qid ?? '',
        )}"
        >${question.open_issue_count}</a
      >`.toString();
    }
    return text.toString();
  };

  window.topicFormatter = function (_topic: any, question: QuestionsPageData) {
    return TopicBadgeHtml(question.topic).toString();
  };

  window.tagsFormatter = function (_tags: any, question: QuestionsPageData) {
    return renderHtml(<TagBadgeList tags={question.tags} />).toString();
  };

  window.sharingSetFormatter = function (_sharing_sets: any, question: QuestionsPageData) {
    const items = [];
    if (question.share_publicly) {
      items.push(html`<span class="badge color-green3">Public</span>`);
    }
    if (question.share_source_publicly) {
      items.push(html`<span class="badge color-green3">Public source</span>`);
    }
    items.push(
      ...(question.sharing_sets ?? []).map(
        (sharing_set) => html`<span class="badge color-gray1">${sharing_set.name}</span>`,
      ),
    );
    return joinHtml(items, ' ').toString();
  };

  window.versionFormatter = function (_version: any, question: QuestionsPageData) {
    return html`<span class="badge color-${question.display_type === 'v3' ? 'green1' : 'red1'}"
      >${question.display_type}</span
    >`.toString();
  };

  window.topicSorter = function (topicA: Topic, topicB: Topic) {
    return topicA.name?.localeCompare(topicB.name ?? '');
  };

  window.genericFilterSearch = function (search: string, value: string) {
    return $('<div>')
      .html(value)
      .find('.formatter-data')
      .text()
      .toUpperCase()
      .includes(search.toUpperCase());
  };

  window.badgeFilterSearch = function (search: string, value: string) {
    if (search === '(none)') {
      return value === '';
    }
    const values = $('<div>')
      .html(value)
      .find('.badge, .btn-badge')
      .filter(
        (i, elem) => $(elem).text().trim().toUpperCase() === search.trim().toUpperCase(),
      ).length;
    return !!values;
  };

  const assessmentsByCourseInstanceFormatter = function (
    course_instance_id: string,
    question: QuestionsPageData,
  ) {
    return (question.assessments ?? [])
      .filter(
        (assessment) => assessment.course_instance_id.toString() === course_instance_id.toString(),
      )
      .map((assessment) =>
        AssessmentBadgeHtml({
          plainUrlPrefix,
          courseInstanceId: course_instance_id,
          assessment,
        }).toString(),
      )
      .join(' ');
  };

  const assessmentsByCourseInstanceList = function (ci_id: string) {
    const data = $('#questionsTable').bootstrapTable('getData') as QuestionsPageData[];
    const assessments = data
      .flatMap((row) => row.assessments ?? [])
      .filter((row) => row && row.course_instance_id === ci_id);
    return {
      ...Object.fromEntries(assessments.map(({ label }) => [label, label])),
      '(None)': '(None)',
    };
  };

  course_instance_ids.forEach((courseInstanceId: string) => {
    window[`assessments${courseInstanceId}List`] = function () {
      return assessmentsByCourseInstanceList(courseInstanceId);
    };

    window[`assessments${courseInstanceId}Formatter`] = function (
      _: any,
      question: QuestionsPageData,
    ) {
      return assessmentsByCourseInstanceFormatter(courseInstanceId, question);
    };
  });

  const tableSettings: ExtendedBootstrapTableOptions = {
    // TODO: If we can pick up the following change, we can drop the `icons` config here:
    // https://github.com/wenzhixin/bootstrap-table/pull/7190
    iconsPrefix: 'fa',
    icons: {
      columns: 'fa-table-list',
    },

    buttons: {
      clearFilters: {
        text: 'Clear filters',
        icon: 'fa-times',
        attributes: { title: 'Clear all set question filters' },
        event: () => {
          $('#questionsTable').bootstrapTable('clearFilterControl');
        },
      },
    },

    onResetView() {
      const searchInputs = document.querySelectorAll(
        '#questionsTable .form-control, #questionsTable .form-select',
      );
      searchInputs.forEach((searchInput) => {
        searchInput.setAttribute(
          'aria-label',
          `Filter by ${searchInput.closest('th')?.querySelector('div.th-inner')?.textContent?.trim()}`,
        );
      });
    },
  };

  if (showAddQuestionButton) {
    tableSettings.buttons.addQuestion = {
      text: 'Add question',
      icon: 'fa-plus',
      attributes: { title: 'Create a new question' },
      event: () => {
        $('#createQuestionModal').modal('show');
      },
    };
  }

  if (showAiGenerateQuestionButton) {
    tableSettings.buttons.aiGenerateQuestion = {
      html: html`
        <a class="btn btn-secondary" href="${urlPrefix}/ai_generate_question_drafts">
          <i class="bi bi-stars" aria-hidden="true"></i>
          Generate question with AI
        </a>
      `.toString(),
    };
  }

  $('#questionsTable').bootstrapTable(tableSettings);

  $(document).keydown((event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      String.fromCharCode(event.which).toLowerCase() === 'f'
    ) {
      if (
        $('.sticky-header-container:visible input.bootstrap-table-filter-control-qid').length > 0
      ) {
        $('.sticky-header-container:visible input.bootstrap-table-filter-control-qid').focus();
      } else {
        $('input.bootstrap-table-filter-control-qid').focus();
      }
      event.preventDefault();
    }
  });
});
