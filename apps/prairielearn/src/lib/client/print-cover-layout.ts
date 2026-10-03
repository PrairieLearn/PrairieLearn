export function layoutPrintGradingTable(source: HTMLElement, pageHeight: number): void {
  const table = source.querySelector<HTMLElement>('.exam-grading-table');
  if (!table) return;
  const grid = table.querySelector<HTMLElement>('.exam-grading-grid')!;
  const cover = table.closest<HTMLElement>('.exam-cover')!;
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
    row.className = 'exam-grading-row';
    const number = document.createElement('span');
    number.textContent = label;
    const line = document.createElement('span');
    line.className = 'exam-grading-score';
    row.append(number, line);
    grid.append(row);
  }
  const labelWidth = Math.max(
    ...[...grid.querySelectorAll('.exam-grading-row > span:first-child')].map(
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
