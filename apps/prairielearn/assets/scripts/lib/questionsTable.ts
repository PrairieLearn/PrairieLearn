import { decodeData, onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';
import {
  Tabulator,
  FormatModule,
  EditModule,
  FilterModule,
  SortModule,
  PageModule,
  MutatorModule,
  FrozenColumnsModule,
  CellComponent,
  Editor,
} from 'tabulator-tables';
import { html } from '@prairielearn/html';
import { uniq } from 'lodash';

// TODO Import types from models and db-types
interface Assessment {
  assessment_id: string;
  course_instance_id: string;
  label: string;
  color: string;
}
interface CourseInstance {
  id: string;
  short_name: string;
  current: boolean;
}
interface Topic {
  id: string;
  name: string;
  color: string;
}
interface Tag {
  id: string;
  name: string;
  color: string;
}
interface SharingSet {
  id: string;
  course_id: string;
  name: string;
}

interface Question {
  id: string;
  qid: string;
  display_type: string;
  grading_method: string;
  external_grading_image: string | null;
  topic: Topic | null;
  tags: Tag[] | null;
  sharing_sets: SharingSet[] | null;
  assessments: Assessment[] | null;
  sync_errors: string | null;
  sync_warnings: string | null;
  sync_errors_ansified: string | null;
  sync_warnings_ansified: string | null;
  open_issue_count: number;
}

interface QuestionsData {
  plainUrlPrefix: string;
  urlPrefix: string;
  questions: Question[];
  course_instances: CourseInstance[];
  showSharingSets: boolean;
}

Tabulator.registerModule([
  FormatModule,
  EditModule,
  FilterModule,
  SortModule,
  PageModule,
  MutatorModule,
  FrozenColumnsModule,
]);

onDocumentReady(() => {
  const { plainUrlPrefix, questions, course_instances, showSharingSets } =
    decodeData<QuestionsData>('questions-table-data');
  const table = new Tabulator('#questionsTable', {
    data: questions,
    layout: 'fitData',
    pagination: true,
    paginationCounter: (pageSize, currentRow, _currentPage, totalRows) =>
      `Showing ${currentRow}-${currentRow + pageSize - 1} of ${totalRows} question${
        totalRows === 1 ? '' : 's'
      }` +
      (totalRows === questions.length
        ? ''
        : ` (filtered from ${questions.length} total question${
            questions.length === 1 ? '' : 's'
          })`),
    paginationSize: 50,
    paginationSizeSelector: [10, 20, 50, 100, 200, 500, true],
    columns: [
      {
        field: 'qid',
        title: 'QID',
        cssClass: 'sticky-column',
        formatter: qidFormatter,
        headerFilter: 'input',
        frozen: true,
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
          html`<span class="badge color-${(cell.getValue() as Topic).color}"
            >${(cell.getValue() as Topic).name}</span
          >`.toString(),
        sorter: (a: Topic, b: Topic) => a.name.localeCompare(b.name),
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Topics)',
        headerFilterFunc: (headerValue: string, rowValue: Topic) => headerValue === rowValue.name,
        headerFilterParams: {
          values: [{ label: '(All Topics)' }, ...uniq(questions.map((q) => q.topic.name)).sort()],
        },
      },
      {
        field: 'tags',
        title: 'Tags',
        formatter: (cell) =>
          (cell.getValue() as Tag[])
            ?.map((tag) =>
              html`<span class="badge color-${tag.color}">${tag.name}</span>`.toString(),
            )
            .join(' '),
        headerSort: false,
        headerFilter: 'list',
        headerFilterPlaceholder: '(All Tags)',
        headerFilterFunc: (headerValue: string, rowValue: Tag[]) =>
          rowValue?.some((tag) => headerValue === tag.name),
        headerFilterParams: {
          values: [
            { label: '(All Tags)' },
            ...uniq(questions.map((q) => q.tags?.map((tag) => tag.name) ?? []).flat()).sort(),
          ],
        },
      },
      ...(showSharingSets
        ? [
            {
              field: 'sharing_sets',
              title: 'Sharing Sets',
              formatter: (cell) =>
                (cell.getValue() as SharingSet[])
                  ?.map((sharing_set) =>
                    html`<span class="badge color-gray1">${sharing_set.name}</span>`.toString(),
                  )
                  .join(' '),
              headerSort: false,
              headerFilter: 'list' as Editor,
              headerFilterPlaceholder: '(All Sharing Sets)',
              headerFilterFunc: (headerValue: string, rowValue: SharingSet[]) =>
                rowValue?.some((sharing_set) => headerValue === sharing_set.name),
              headerFilterParams: {
                values: [
                  { label: '(All Sharing Sets)' },
                  ...uniq(
                    questions
                      .map((q) => q.sharing_sets?.map((sharing_set) => sharing_set.name) ?? [])
                      .flat(),
                  ).sort(),
                ],
              },
            },
          ]
        : []),
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
        headerFilterFunc: (headerValue: string, rowValue: string) =>
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
        mutator: (_value, data: Question): Assessment[] =>
          data.assessments?.filter((a) => a.course_instance_id.toString() === ci.id.toString()) ??
          [],
        visible: ci.current,
        headerSort: false,
        formatter: (cell: CellComponent) =>
          (cell.getValue() as Assessment[])
            ?.map((assessment) =>
              html`<a
                href="${plainUrlPrefix}/course_instance/${ci.id}/instructor/assessment/${assessment.assessment_id}"
                class="badge color-${assessment.color} color-hover"
                onclick="event.stopPropagation();"
                ><span>${assessment.label}</span></a
              >`.toString(),
            )
            .join(' '),
        headerFilter: 'list' as Editor,
        headerFilterPlaceholder: '(All Assessments)',
        headerFilterFunc: (headerValue: string, rowValue: Assessment[]) =>
          headerValue === '0'
            ? !rowValue?.length
            : rowValue?.some((row) => headerValue === row.label),
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
                      .map((a) => a.label) ?? [],
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
      // Set focus to filter of first visible column
      table.setHeaderFilterFocus(table.getColumns().find((c) => c.isVisible()));
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
        table.redraw();
      });
    });
  });

  table.on('renderComplete', () => {
    // Popovers must be reloaded when the table is rendered (e.g., after a page change or filter)
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

  document
    .querySelector<HTMLButtonElement>('.js-clear-filters-btn')
    .addEventListener('click', () => {
      table.clearFilter(true);
    });
});

function qidFormatter(cell: CellComponent): string {
  const { urlPrefix } = decodeData<QuestionsData>('questions-table-data');
  const question: Question = cell.getRow().getData();
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
