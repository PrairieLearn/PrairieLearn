/* eslint-env browser, jquery */

import _ from 'lodash';

import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { AssessmentBadge } from '../../../src/components/AssessmentBadge.html.js';
import { SyncProblemButton } from '../../../src/components/SyncProblemButton.html.js';
import { TagBadgeList } from '../../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../../src/components/TopicBadge.html.js';

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
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(data, (row) => row.topic.name));
  };

  window.tagsList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(_.flatten(_.filter(_.map(data, (row) => row.tags))), (row) => row.name));
  };

  window.sharingSetsList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    const sharing_sets = _.keyBy(
      _.map(_.flatten(_.filter(_.map(data, (row) => row.sharing_sets))), (row) => row.name),
    );
    sharing_sets['Public'] = 'Public';
    return sharing_sets;
  };

  window.versionList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(data, (row) => row.display_type));
  };

  window.qidFormatter = function (qid, question) {
    var text = '';
    if (question.sync_errors) {
      text += SyncProblemButton({
        type: 'error',
        output: question.sync_errors,
      });
    } else if (question.sync_warnings) {
      text += SyncProblemButton({
        type: 'warning',
        output: question.sync_warnings,
      });
    }
    text += html`
      <a class="formatter-data" href="${urlPrefix}/question/${question.id}/preview">
        ${qidPrefix}${question.qid}
      </a>
    `;
    if (question.open_issue_count > 0) {
      text += html`<a
        class="badge badge-pill badge-danger ml-1"
        href="${urlPrefix}/course_admin/issues?q=is%3Aopen+qid%3A${encodeURIComponent(
          question.qid,
        )}"
        >${question.open_issue_count}</a
      >`;
    }
    return text.toString();
  };

  window.topicFormatter = function (topic, question) {
    return TopicBadge(question.topic).toString();
  };

  window.tagsFormatter = function (tags, question) {
    return TagBadgeList(question.tags).toString();
  };

  window.sharingSetFormatter = function (sharing_sets, question) {
    return (
      (question.shared_publicly ? html`<span class="badge color-green3">Public</span> ` : '') +
      _.map(question.sharing_sets ?? [], (sharing_set) =>
        html`<span class="badge color-gray1">${sharing_set.name}</span>`.toString(),
      ).join(' ')
    );
  };

  window.versionFormatter = function (version, question) {
    return html`<span class="badge color-${question.display_type === 'v3' ? 'green1' : 'red1'}"
      >${question.display_type}</span
    >`.toString();
  };

  window.topicSorter = function (topicA, topicB) {
    return topicA.name.localeCompare(topicB.name);
  };

  window.genericFilterSearch = function (search, value) {
    return $('<div>')
      .html(value)
      .find('.formatter-data')
      .text()
      .toUpperCase()
      .includes(search.toUpperCase());
  };

  window.badgeFilterSearch = function (search, value) {
    if (search === '(none)') {
      return value === '';
    }
    var values = $('<div>')
      .html(value)
      .find('.badge')
      .filter(
        (i, elem) => $(elem).text().trim().toUpperCase() === search.trim().toUpperCase(),
      ).length;
    return !!values;
  };

  let assessmentsByCourseInstanceFormatter = function (course_instance_id, question) {
    return (question.assessments ?? [])
      .filter(
        (assessment) => assessment.course_instance_id.toString() === course_instance_id.toString(),
      )
      .map((assessment) =>
        AssessmentBadge({ plainUrlPrefix, course_instance_id, assessment }).toString(),
      )
      .join(' ');
  };

  let assessmentsByCourseInstanceList = function (ci_id) {
    var data = $('#questionsTable').bootstrapTable('getData');
    var assessments = _.filter(
      _.flatten(_.map(data, (row) => row.assessments)),
      (row) => row && row.course_instance_id === ci_id,
    );
    return _.assign(_.keyBy(_.map(assessments, (row) => row.label)), { '(None)': '(None)' });
  };

  course_instance_ids.forEach((courseInstanceId) => {
    window[`assessments${courseInstanceId}List`] = function () {
      return assessmentsByCourseInstanceList(courseInstanceId);
    };

    window[`assessments${courseInstanceId}Formatter`] = function (_, question) {
      return assessmentsByCourseInstanceFormatter(courseInstanceId, question);
    };
  });

  const tableSettings = {
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
          `Filter by ${searchInput.closest('th').querySelector('div.th-inner').textContent.trim()}`,
        );
      });
    },
  };

  if (showAddQuestionButton) {
    tableSettings.buttons.addQuestion = {
      text: 'Add Question',
      icon: 'fa-plus',
      attributes: { title: 'Create a new question' },
      event: () => {
        $('form[name=add-question-form]').submit();
      },
    };
  }

  if (showAiGenerateQuestionButton) {
    tableSettings.buttons.aiGenerateQuestion = {
      html: html`
        <a class="btn btn-secondary" href="${urlPrefix}/ai_generate_question">
          <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
          Generate Question with AI
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
      if ($('.sticky-header-container:visible input.bootstrap-table-filter-control-qid').length) {
        $('.sticky-header-container:visible input.bootstrap-table-filter-control-qid').focus();
      } else {
        $('input.bootstrap-table-filter-control-qid').focus();
      }
      event.preventDefault();
    }
  });
});
