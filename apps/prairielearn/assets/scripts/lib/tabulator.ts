import { parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { v4 as uuid } from 'uuid';
import {
  Tabulator,
  FormatModule,
  EditModule,
  FilterModule,
  SortModule,
  PageModule,
  MutatorModule,
  FrozenColumnsModule,
  ResizeTableModule,
  Options,
} from 'tabulator-tables';

Tabulator.registerModule([
  FormatModule, // custom formatters
  EditModule, // editors, also required for header filters
  FilterModule, // column header filters
  SortModule, // sorting by clicking on headers
  PageModule, // pagination
  MutatorModule, // calculate data derived from other columns
  FrozenColumnsModule, // freeze first column
  ResizeTableModule, // recalculate column widths on page resize
]);

type DefaultTabulatorOptions = Options & {
  columnVisibilityDropdown?: Element | null;
};

export function defaultTabulator(
  elementQueryString: string,
  options: DefaultTabulatorOptions,
): Tabulator {
  const table: Tabulator = new Tabulator(elementQueryString, {
    layout: 'fitData',
    pagination: true,
    paginationCounter: (pageSize, currentRow, _currentPage, totalRows) =>
      `Showing ${currentRow}-${currentRow + pageSize - 1} of ${totalRows} question${
        totalRows === 1 ? '' : 's'
      }` +
      (totalRows === table.getData().length
        ? ''
        : ` (filtered from ${table.getData().length} total question${
            table.getData().length === 1 ? '' : 's'
          })`),
    paginationSize: 50,
    paginationSizeSelector: [10, 20, 50, 100, 200, 500, true],
    ...options,
    langs: {
      default: {
        pagination: {
          first: '<i class="bi bi-chevron-bar-left"></i>',
          last: '<i class="bi bi-chevron-bar-right"></i>',
          prev: '<i class="bi bi-chevron-left"></i>',
          next: '<i class="bi bi-chevron-right"></i>',
        },
      },
      ...options?.langs,
    },
  });

  if (options.columnVisibilityDropdown) {
    const dropdown = options.columnVisibilityDropdown;
    table.on('tableBuilt', () => {
      table.getColumns().forEach((col) => {
        const dropdownItemId = `column-visible-${uuid()}`;
        const dropdownItem = parseHTMLElement(
          document,
          html`<div class="dropdown-item">
            <div class="form-check">
              <input id="${dropdownItemId}" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="${dropdownItemId}">
                ${col.getDefinition().title}
              </label>
            </div>
          </div>`,
        );
        dropdown.appendChild(dropdownItem);
        const input = dropdownItem.querySelector<HTMLInputElement>('input');
        if (input != null) {
          input.checked = col.isVisible();
          input.addEventListener('change', () => {
            input.checked ? col.show() : col.hide();
            table.redraw();
          });
        }
      });
    });
  }

  if (options.layout == null) {
    // Only rearrange column widths if the layout is not explicitly set to a different value
    table.on('renderStarted', () => {
      // Reset column widths to fit content
      table
        .getColumns()
        .filter((col) => col.getWidth() != null)
        .forEach((col) => {
          col.setWidth(true);
        });
    });

    table.on('renderComplete', () => {
      // Resize columns to fill the table width (since fitData does not support this)
      const columnsWidth = table
        .getColumns()
        .map((col) => col.getWidth())
        .reduce((a, b) => a + (b ?? 0), 0);
      const tableWidth = table.element.clientWidth;
      const extraWidth = tableWidth - columnsWidth;
      if (extraWidth > 0) {
        const ratio = 1 + extraWidth / columnsWidth;
        table
          .getColumns()
          .filter((col) => col.getWidth() != null)
          .forEach((col) => {
            col.setWidth(col.getWidth() * ratio);
          });
      }
    });
  }

  return table;
}

export function selectFilterOnSearch(table: Tabulator): void {
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      // Set focus to filter of first visible column with a filter
      const firstVisibleColumn = table
        .getColumns()
        .find((c) => c.isVisible() && c.getDefinition().headerFilter != null);
      // If the filter is already in focus, fallback to the default behaviour of Ctrl-F in the browser
      if (
        firstVisibleColumn != null &&
        !firstVisibleColumn.getElement().contains(document.activeElement)
      ) {
        firstVisibleColumn.headerFilterFocus();
        event.preventDefault();
      }
    }
  });
}
