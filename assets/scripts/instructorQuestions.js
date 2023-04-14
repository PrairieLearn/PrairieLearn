/* global _ */

$(() => {
  const {
    data,
    courseInstances,
    plainUrlPrefix,
    urlPrefix,
    hasLegacyQuestions,
    currentCourseInstance,
    newQuestionAllowed,
  } = document.querySelector('#questionsTable').dataset;

  const columns = [
    { name: 'qid', data: 'qid', title: 'QID', render: { display: qidFormatter }, filter: 'input' },
    { name: 'title', data: 'title', title: 'Title', filter: 'input' },
    {
      name: 'topic',
      data: 'topic',
      title: 'Topic',
      render: {
        display: (data) => `<span class="badge color-${data.color}">${_.escape(data.name)}</span>`,
        filter: (data) => data.id,
        _: (data) => data.name,
      },
      filter: 'select',
      filterOptions: (list, topic) => ({ ...list, [topic.id]: topic.name }),
      filterPlaceholder: '(All Topics)',
    },
    {
      name: 'tags',
      data: 'tags',
      title: 'Tags',
      orderable: false,
      render: {
        display: (data) =>
          (data ?? [])
            .map((tag) => `<span class="badge color-${tag.color}">${_.escape(tag.name)}</span>`)
            .join(' '),
        filter: (data) => (data ?? []).map((tag) => tag.id),
      },
      filter: 'select',
      filterOptions: (list, tags) => ({ ...list, ..._.mapValues(_.keyBy(tags, 'id'), 'name') }),
      filterPlaceholder: '(All Tags)',
    },
    {
      name: 'display_type',
      data: 'display_type',
      title: 'Version',
      visible: JSON.parse(hasLegacyQuestions),
      render: {
        display: (data) =>
          `<span class="badge color-${data === 'v3' ? 'green1' : 'red1'}">
               ${_.escape(data)}</span>`,
      },
      filter: 'select',
      filterPlaceholder: '(All Tags)',
    },
    {
      name: 'grading_method',
      data: 'grading_method',
      title: 'Grading Method',
      visible: false,
      filter: 'select',
      filterPlaceholder: '(All Methods)',
    },
    {
      name: 'external_grading_image',
      data: 'external_grading_image',
      title: 'External Grading Image',
      defaultContent: '&mdash;',
      visible: false,
      filter: 'select',
      filterPlaceholder: '(All Images)',
    },
  ].concat(
    JSON.parse(courseInstances).map((ci) => ({
      data: (row) =>
        // eslint-disable-next-line eqeqeq
        (row.assessments ?? []).filter((assessment) => assessment.course_instance_id == ci.id),
      title: `<span class="text-nowrap">${_.escape(ci.short_name)} Assessments</span>`,
      // eslint-disable-next-line eqeqeq
      visible: currentCourseInstance == ci.id,
      orderable: false,
      render: {
        display: (data) =>
          data?.length
            ? data
                .map(
                  (assessment) =>
                    `<a href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/assessment/${
                      assessment.assessment_id
                    }" class="badge color-${assessment.color} color-hover">
                  <span>${_.escape(assessment.label)}</span></a>`
                )
                .join(' ')
            : '&mdash;',
        filter: (data) =>
          data?.length ? data.map((assessment) => assessment.assessment_id) : ['NONE'],
      },
      filter: 'select',
      filterOptions: (list, items) => ({
        ...list,
        ...(items?.length
          ? _.mapValues(_.keyBy(items, 'assessment_id'), 'label')
          : { NONE: '(None)' }),
      }),
      filterPlaceholder: '(All Assessments)',
    }))
  );

  const table = $('#questionsTable')
    .DataTable({
      data: JSON.parse(data),
      fixedHeader: true,
      lengthMenu: [
        [10, 20, 50, 100, 200, 500, -1],
        [10, 20, 50, 100, 200, 500, 'All'],
      ],
      pageLength: 50,
      scrollX: true,
      fixedColumns: { left: 1 },
      buttons: [
        { extend: 'colvis', text: '<i class="fas fa-th-list"></i> Columns' },
        {
          text: '<i class="fas fa-times"></i> Clear filters',
          title: 'Clear all question filters',
          action: () => {
            document.querySelectorAll('.js-filter-input').forEach((input) => {
              input.value = '';
              input.dispatchEvent(new Event('input'));
            });
            table.search('').draw();
          },
        },
      ].concat(
        JSON.parse(newQuestionAllowed)
          ? [
              {
                text: '<i class="fas fa-plus"></i> Add Question',
                title: 'Create a new question',
                action: () => {
                  $('form[name=add-question-form]').submit();
                },
              },
            ]
          : []
      ),
      dom:
        // row 1: page info, buttons
        // row 2: table, control
        // row 3: page info, page list, length selection
        "<'row m-1'<'col-sm-12 col-md-6'i><'col-sm-12 col-md-6 text-right'B>>" +
        "<'row'<'col-sm-12 table-responsive'tr>>" +
        "<'row'<'col-sm-12 col-md-5'i><'col-sm-4 col-md-2'l><'col-sm-8 col-md-5'p>>",
      columnDefs: [
        { targets: '_all', className: 'align-middle' },
        { targets: '_all', className: 'text-nowrap' },
      ],
      columns: columns,
      initComplete: function () {
        columns.forEach((column, index) => {
          if (column.filter) {
            const dtColumn = this.api().column(index);
            const input = document.createElement(column.filter);
            input.classList.add('form-control', 'js-filter-input');

            // Keep events in the input from propagating to the header (which triggers ordering or
            // something similar)
            ['click', 'keydown', 'keypress', 'keyup'].forEach((e) => {
              input.addEventListener(e, (event) => {
                event.stopPropagation();
              });
            });

            if (column.filter === 'select') {
              const options = dtColumn
                .data()
                .reduce(
                  column.filterOptions ||
                    ((list, value) => (value ? { ...list, [value]: value } : list)),
                  {}
                );
              const option = document.createElement('option');
              option.setAttribute('value', '');
              option.innerText = column.filterPlaceholder ?? '(All)';
              input.appendChild(option);
              Object.entries(options)
                .sort(([, a], [, b]) => a.localeCompare(b))
                .forEach(([key, value]) => {
                  const option = document.createElement('option');
                  option.setAttribute('value', key);
                  option.innerText = value;
                  input.appendChild(option);
                });

              input.addEventListener('input', () => {
                const val = $.fn.dataTable.util.escapeRegex(input.value);
                dtColumn.search(input.value ? `^${val}$` : '', true, false).draw();
              });
            } else if (column.filter === 'input') {
              input.setAttribute('type', column.filterType ?? 'search');
              input.addEventListener('input', () => {
                dtColumn.search(input.value).draw();
              });
            }

            dtColumn.header().appendChild(input);
          }
        });
      },
    })
    .on('draw', () => {
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
    });

  $(document).keydown((event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      String.fromCharCode(event.which).toLowerCase() === 'f'
    ) {
      $('input[type="search"]:visible:first').focus();
      event.preventDefault();
    }
  });

  function qidFormatter(qid, type, question) {
    if (type !== 'display') return qid;
    var text = '';
    if (question.sync_errors) {
      text += `<button class="btn btn-xs mr-1" data-toggle="popover" data-title="Sync Errors"
                     data-content="<pre style=&quot;background-color: black&quot;
                                        class=&quot;text-white rounded p-3&quot;>
                                        ${_.escape(question.sync_errors_ansified)}</pre>">
                    <i class="fa fa-times text-danger" aria-hidden="true"></i>
                  </button>`;
    } else if (question.sync_warnings) {
      text += `<button class="btn btn-xs mr-1" data-toggle="popover" data-title="Sync Warnings"
                     data-content="<pre style=&quot;background-color: black&quot;
                                        class=&quot;text-white rounded p-3&quot;>
                                        ${_.escape(question.sync_warnings_ansified)}</pre>">
                    <i class="fa fa-exclamation-triangle text-warning" aria-hidden="true"></i>
                  </button>`;
    }
    text += `<a class="formatter-data" href="${urlPrefix}/question/${question.id}/">
             ${_.escape(question.qid)}</a>`;
    if (question.open_issue_count > 0) {
      text += `<a class="badge badge-pill badge-danger ml-1" href="${urlPrefix}/course_admin/issues?q=is%3Aopen+qid%3A${_.escape(
        question.qid
      )}">${question.open_issue_count}</a>`;
    }
    return text;
  }
});
