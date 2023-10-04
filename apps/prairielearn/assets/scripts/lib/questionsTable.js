/* eslint-env browser, jquery */

import _ from 'lodash';
import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

onDocumentReady(() => {
  const { course_instance_ids, showAddQuestionButton, urlPrefix, plainUrlPrefix } =
    decodeData('questions-table-data');
  window.topicList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(data, (row) => row.topic.name));
  };

  window.tagsList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(_.flatten(_.filter(_.map(data, (row) => row.tags))), (row) => row.name));
  };

  window.versionList = function () {
    var data = $('#questionsTable').bootstrapTable('getData');
    return _.keyBy(_.map(data, (row) => row.display_type));
  };

  window.qidFormatter = function (qid, question) {
    var text = '';
    if (question.sync_errors) {
      text += html`<button
        class="btn btn-xs mr-1"
        data-toggle="popover"
        data-title="Sync Errors"
        data-content='<pre style="background-color: black" class="text-white rounded p-3">${question.sync_errors_ansified}</pre>'
      >
        <i class="fa fa-times text-danger" aria-hidden="true"></i>
      </button>`;
    } else if (question.sync_warnings) {
      text += html`<button
        class="btn btn-xs mr-1"
        data-toggle="popover"
        data-title="Sync Warnings"
        data-content='<pre style="background-color: black" class="text-white rounded p-3">${question.sync_warnings_ansified}</pre>'
      >
        <i class="fa fa-exclamation-triangle text-warning" aria-hidden="true"></i>
      </button>`;
    }
    text += html`<a class="formatter-data" href="${urlPrefix}/question/${question.id}/"
      >${question.qid}</a
    >`;
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
    return html`<span class="badge color-${question.topic.color}"
      >${question.topic.name}</span
    >`.toString();
  };

  window.tagsFormatter = function (tags, question) {
    return _.map(question.tags ?? [], (tag) =>
      html`<span class="badge color-${tag.color}">${tag.name}</span>`.toString(),
    ).join(' ');
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
      .filter((i, elem) => $(elem).text().toUpperCase() === search.toUpperCase()).length;
    return !!values;
  };

  let assessmentsByCourseInstanceFormatter = function (ci_id, question) {
    var ci_assessments = _.filter(
      question.assessments ?? [],
      (assessment) => assessment.course_instance_id === ci_id,
    );
    return _.map(ci_assessments, (assessment) =>
      html`<a
        href="${plainUrlPrefix}/course_instance/${ci_id}/instructor/assessment/${assessment.assessment_id}"
        class="badge color-${assessment.color} color-hover"
        onclick="event.stopPropagation();"
        ><span>${assessment.label}</span></a
      >`.toString(),
    ).join(' ');
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
    icons: {
      columns: 'fa-th-list',
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
    onPreBody: function () {},
    onResetView: function () {
      $('[data-toggle="popover"]')
        .popover({
          sanitize: false,
          container: 'body',
          html: true,
          trigger: 'hover',
        })
        .on('show.bs.popover', function () {
          $($(this).data('bs.popover').getTipElement()).css('max-width', '80%');
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
