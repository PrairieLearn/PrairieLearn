import { parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
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
  });

  if (options.columnVisibilityDropdown) {
    const dropdown = options.columnVisibilityDropdown;
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
      if (firstVisibleColumn != null) {
        table.setHeaderFilterFocus(firstVisibleColumn);
        event.preventDefault();
      }
    }
  });
}
