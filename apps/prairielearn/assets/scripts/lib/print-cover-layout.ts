/**
 * Fits the optional grading table into the cover's remaining space before pagination.
 * Call after fonts and images have loaded, with the printable content height in CSS pixels.
 * Throws if the table cannot fit and saves the successful layout for the Word cover.
 */
export function layoutPrintGradingTable(source: HTMLElement, pageHeight: number): void {
  const table = source.querySelector<HTMLElement>('.assessment-grading-table');
  if (!table) return;
  const grid = table.querySelector<HTMLElement>('.assessment-grading-grid')!;
  grid.setAttribute('role', 'table');
  grid.setAttribute('aria-label', 'Question scores');
  const cover = table.closest<HTMLElement>('.assessment-cover')!;
  const footer = cover.querySelector('footer')!;
  const questionNumbers = [...source.querySelectorAll<HTMLElement>('.printing-question')].map(
    (question) => question.dataset.questionNumber!,
  );
  table.hidden = false;
  const footerBounds = footer.getBoundingClientRect();
  const availableHeight = Math.floor(
    Math.min(
      footerBounds.top,
      cover.getBoundingClientRect().top + pageHeight - footerBounds.height,
    ) -
      grid.getBoundingClientRect().top -
      12,
  );
  const labels = [...questionNumbers, 'Total'];
  const rowsPerColumn = Math.min(labels.length, Math.floor(availableHeight / 28));
  const columns = Math.ceil(labels.length / rowsPerColumn);
  for (const label of labels) {
    const row = document.createElement('div');
    row.className = 'assessment-grading-row';
    row.setAttribute('role', 'row');
    const number = document.createElement('span');
    number.textContent = label;
    number.setAttribute('role', 'rowheader');
    const line = document.createElement('span');
    line.className = 'assessment-grading-score';
    line.setAttribute('role', 'cell');
    line.setAttribute('aria-label', 'Score');
    const rule = document.createElement('span');
    rule.dataset.printPdfRole = 'Artifact';
    line.append(rule);
    row.append(number, line);
    grid.append(row);
  }
  const labelWidth = Math.max(
    ...[...grid.querySelectorAll('.assessment-grading-row > span:first-child')].map(
      (label) => label.getBoundingClientRect().width,
    ),
  );
  if (rowsPerColumn < 1 || columns * (labelWidth + 64) + (columns - 1) * 20 > grid.clientWidth) {
    throw new Error(
      'The grading table does not fit on the cover page. Shorten the cover instructions or disable the pledge to make room.',
    );
  }
  grid.style.height = `${availableHeight}px`;
  grid.style.gridTemplateRows = `repeat(${rowsPerColumn}, minmax(0, 1fr))`;
  document.documentElement.dataset.printGradingTable = JSON.stringify({
    questionNumbers,
    rowsPerColumn,
  });
}
