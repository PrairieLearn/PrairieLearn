import { decodeData, onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';
import {
  Tabulator,
  FormatModule,
  EditModule,
  FilterModule,
  SortModule,
  PageModule,
  MutatorModule,
} from 'tabulator-tables';
import { html } from '@prairielearn/html';
import { uniq } from 'lodash';

Tabulator.registerModule([
  FormatModule,
  EditModule,
  FilterModule,
  SortModule,
  PageModule,
  MutatorModule,
]);

onDocumentReady(() => {
  const { plainUrlPrefix, questions, course_instances } = decodeData('questions-data');
  const table = new Tabulator('#questionsTable', {
    data: questions,
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [10, 20, 50, 100, 200, 500, true],
    columns: [
      {
        field: 'qid',
        title: 'QID',
        cssClass: 'sticky-column',
        formatter: qidFormatter,
        headerFilter: 'input',
      },
      {
        field: 'title',
        title: 'Title',
        headerFilter: 'input',
      },
      {
        field: 'topic',
        title: 'Topic',
        formatter: (cell) =>
          html`<span class="badge color-${cell.getValue().color}"
            >${cell.getValue().name}</span
          >`.toString(),
        sorter: (a, b) => a.name.localeCompare(b.name),
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Topics)',
        headerFilterFunc: (headerValue, rowValue) => headerValue === rowValue.name,
        headerFilterParams: {
          values: [{ label: '(All Topics)' }, ...uniq(questions.map((q) => q.topic.name)).sort()],
        },
      },
      {
        field: 'tags',
        title: 'Tags',
        formatter: (cell) =>
          cell
            .getValue()
            ?.map((tag) =>
              html`<span class="badge color-${tag.color}">${tag.name}</span>`.toString(),
            )
            .join(' '),
        headerSort: false,
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Tags)',
        headerFilterFunc: (headerValue, rowValue) =>
          rowValue?.some((tag) => headerValue === tag.name),
        headerFilterParams: {
          values: [
            { label: '(All Tags)' },
            ...uniq(questions.map((q) => q.tags?.map((tag) => tag.name)).flat()).sort(),
          ],
        },
      },
      {
        field: 'display_type',
        title: 'Version',
        visible: questions.some((q) => q.display_type !== 'v3'),
        formatter: (cell) =>
          html`<span class="badge color-${cell.getValue() === 'v3' ? 'green1' : 'red1'}"
            >${cell.getValue()}</span
          >`.toString(),
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Versions)',
        headerFilterParams: {
          values: [
            { label: '(All Versions)' },
            ...uniq(questions.map((q) => q.display_type)).sort(),
          ],
        },
      },
      {
        field: 'grading_method',
        title: 'Grading Method',
        visible: false,
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Methods)',
        headerFilterParams: {
          values: [
            { label: '(All Methods)' },
            ...uniq(questions.map((q) => q.grading_method)).sort(),
          ],
        },
      },
      {
        field: 'external_grading_image',
        title: 'External Grading Image',
        visible: false,
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Images)',
        headerFilterFunc: (headerValue, rowValue) =>
          headerValue === '(No Image)' ? !rowValue : headerValue === rowValue,
        headerFilterParams: {
          values: [
            { label: '(All Images)' },
            ...uniq(questions.map((q) => q.external_grading_image || '(No Image)')).sort(),
          ],
        },
      },
      ...course_instances.map((ci) => ({
        field: `assessments_${ci.id}`,
        title: `${ci.short_name} Assessments`,
        mutator: (_value, data) =>
          data.assessments?.filter((a) => a.course_instance_id.toString() === ci.id.toString()),
        visible: ci.current,
        headerSort: false,
        formatter: (cell) =>
          cell
            .getValue()
            ?.map((assessment) =>
              html`<a
                href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/assessment/${assessment.assessment_id}"
                class="badge color-${assessment.color} color-hover"
                onclick="event.stopPropagation();"
                ><span>${assessment.label}</span></a
              >`.toString(),
            )
            .join(' '),
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Assessments)',
        headerFilterFunc: (headerValue, rowValue) =>
          headerValue === '0'
            ? !rowValue.length
            : rowValue.some((row) => headerValue === row.label),
        headerFilterParams: {
          values: [
            { label: '(All Assessments)' },
            { label: '(None)', value: '0' },
            ...uniq(
              questions
                .map(
                  (q) =>
                    q.assessments
                      ?.filter((a) => a.course_instance_id.toString() === ci.id.toString())
                      .map((a) => a.label),
                )
                .flat(),
            ).sort(),
          ],
        },
      })),
    ],
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      table.setHeaderFilterFocus('qid');
      event.preventDefault();
    }
  });

  table.on('tableBuilt', () => {
    table.getColumns().forEach((col) => {
      const dropdownItem = parseHTMLElement(
        document,
        html`<div class="dropdown-item form-check">
          <label class="form-check-label">
            <input class="form-check-input" type="checkbox" />${col.getDefinition().title}
          </label>
        </div>`,
      );
      document.querySelector('.js-column-visibility').appendChild(dropdownItem);
      const input = dropdownItem.querySelector<HTMLInputElement>('input');
      input.checked = col.isVisible();
      input.addEventListener('change', () => {
        input.checked ? col.show() : col.hide();
      });
    });
  });

  document.querySelector('.js-clear-filters-btn').addEventListener('click', () => {
    table.clearFilter(true);
  });
});

function qidFormatter(cell) {
  const { urlPrefix } = decodeData('questions-data');
  const question = cell.getRow().getData();
  let text = '';
  if (question.sync_errors) {
    text += html`<button
      class="btn btn-xs mr-1"
      data-toggle="popover"
      data-title="Sync Errors"
      data-content='<pre style="background-color: black" class="text-white rounded p-3">${question.sync_errors_ansified}</pre>'
    >
      <i class="fa fa-times text-danger" aria-hidden="true"></i>
    </button>`.toString();
  } else if (question.sync_warnings) {
    text += html`<button
      class="btn btn-xs mr-1"
      data-toggle="popover"
      data-title="Sync Warnings"
      data-content='<pre style="background-color: black" class="text-white rounded p-3">${question.sync_warnings_ansified}</pre>'
    >
      <i class="fa fa-exclamation-triangle text-warning" aria-hidden="true"></i>
    </button>`.toString();
  }
  text += html`<a class="formatter-data" href="${urlPrefix}/question/${question.id}/"
    >${question.qid}</a
  >`.toString();
  if (question.open_issue_count > 0) {
    text += html`<a
      class="badge badge-pill badge-danger ml-1"
      href="<%= urlPrefix %>/course_admin/issues?q=is%3Aopen+qid%3A${question.qid}"
      >${question.open_issue_count}</a
    >`.toString();
  }
  return text;
}
