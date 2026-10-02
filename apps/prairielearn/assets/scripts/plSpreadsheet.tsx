import clsx from 'clsx';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type CellKeyDownArgs,
  type CellKeyboardEvent,
  type Column,
  DataGrid,
  type DataGridHandle,
  type FillEvent,
  type RowsChangeData,
} from 'react-data-grid';
import { createRoot } from 'react-dom/client';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { run } from '@prairielearn/run';

import {
  closeTrailingParentheses,
  describeFirstHole,
} from '../../src/lib/client/spreadsheetFormula/editModel.js';
import {
  formulaReferences,
  tokenizeFormula,
} from '../../src/lib/client/spreadsheetFormula/lexer.js';
import {
  formatReference,
  resolveReference,
} from '../../src/lib/client/spreadsheetFormula/references.js';
import {
  SPREADSHEET_ENGINE_WASM_PATH,
  initializeSpreadsheetEngine,
  parseCellText,
  spreadsheetEngineImports,
} from '../../src/lib/spreadsheet-engine.js';
import {
  type SpreadsheetCellInput,
  type SpreadsheetEditorEvaluation,
  type SpreadsheetElementConfig,
  type SpreadsheetEvaluation,
  type SpreadsheetRawSubmission,
  SpreadsheetRawSubmissionSchema,
  cellAddress,
  evaluateSpreadsheetForEditor,
  getRelativeFillInput,
  isCellEditable,
  parseCellAddress,
} from '../../src/lib/spreadsheet.js';

import { FormulaInput, type FormulaInputHandle } from './lib/spreadsheetFormulaInput.js';

interface SpreadsheetOptions {
  uuid: string;
  answer_name: string;
  aria_label: string;
  height: string;
  config: SpreadsheetElementConfig;
  initial_submission: SpreadsheetRawSubmission;
}

interface SpreadsheetRow {
  rowIndex: number;
  inputs: Record<string, string>;
  results: Record<string, string>;
  errors: Record<string, boolean>;
}

interface CellPosition {
  row: number;
  column: number;
}

interface CellRange {
  anchor: CellPosition;
  focus: CellPosition;
}

const ARROW_OFFSETS: Partial<Record<string, CellPosition>> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
};

function isCellInRange(range: CellRange | null, row: number, column: number) {
  if (!range) return false;
  const firstRow = Math.min(range.anchor.row, range.focus.row);
  const lastRow = Math.max(range.anchor.row, range.focus.row);
  const firstColumn = Math.min(range.anchor.column, range.focus.column);
  const lastColumn = Math.max(range.anchor.column, range.focus.column);
  return row >= firstRow && row <= lastRow && column >= firstColumn && column <= lastColumn;
}

function clampPosition(
  position: CellPosition,
  sheet: { rows: number; columns: number },
): CellPosition {
  return {
    row: Math.max(0, Math.min(sheet.rows - 1, position.row)),
    column: Math.max(0, Math.min(sheet.columns - 1, position.column)),
  };
}

/** The sheet cell under a viewport point, if it is a cell of the grid in `editor`. */
function cellAtPoint(
  editor: HTMLElement | null,
  sheet: { rows: number; columns: number },
  clientX: number,
  clientY: number,
): CellPosition | null {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest<HTMLElement>('[role="gridcell"]');
  if (!cell || !editor?.contains(cell)) return null;
  const row = cell.parentElement;
  const ariaRowIndex = Number(row?.getAttribute('aria-rowindex'));
  const ariaColumnIndex = Number(cell.getAttribute('aria-colindex'));
  const position = { row: ariaRowIndex - 2, column: ariaColumnIndex - 2 };
  if (
    !Number.isInteger(position.row) ||
    !Number.isInteger(position.column) ||
    position.row < 0 ||
    position.row >= sheet.rows ||
    position.column < 0 ||
    position.column >= sheet.columns
  ) {
    return null;
  }
  return position;
}

function displayInput(input: SpreadsheetCellInput | null | undefined): string {
  if (input == null) return '';
  if (typeof input === 'boolean') return input ? 'TRUE' : 'FALSE';
  return String(input);
}

function parseEditorInput(value: string): SpreadsheetCellInput | null {
  if (value === '') return null;
  if (value.startsWith('=')) return value;
  return parseCellText(value);
}

function syncHiddenInput(hiddenInput: HTMLInputElement, submission: SpreadsheetRawSubmission) {
  hiddenInput.value = JSON.stringify(submission);
  hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function finalInput(
  config: SpreadsheetElementConfig,
  rawSubmission: SpreadsheetRawSubmission,
  sheetName: string,
  address: string,
): SpreadsheetCellInput | null {
  if (Object.hasOwn(rawSubmission.sheets, sheetName)) {
    const overrides = rawSubmission.sheets[sheetName];
    if (Object.hasOwn(overrides, address)) return overrides[address];
  }
  const sheet = config.template.sheets.find((candidate) => candidate.name === sheetName);
  return sheet?.cells[address] ?? null;
}

function updateOverride({
  config,
  rawSubmission,
  sheetName,
  address,
  input,
}: {
  config: SpreadsheetElementConfig;
  rawSubmission: SpreadsheetRawSubmission;
  sheetName: string;
  address: string;
  input: SpreadsheetCellInput | null;
}): SpreadsheetRawSubmission {
  const sheets = structuredClone(rawSubmission.sheets);
  if (!Object.hasOwn(sheets, sheetName)) sheets[sheetName] = {};
  const overrides = sheets[sheetName];
  const templateSheet = config.template.sheets.find((sheet) => sheet.name === sheetName);
  const templateInput = templateSheet?.cells[address];

  if (input === null) {
    if (templateInput === undefined) {
      delete overrides[address];
    } else {
      overrides[address] = null;
    }
  } else if (Object.is(input, templateInput)) {
    delete overrides[address];
  } else {
    overrides[address] = input;
  }
  if (Object.keys(overrides).length === 0) delete sheets[sheetName];
  return { ...rawSubmission, sheets };
}

type SpreadsheetSnapshotCell = SpreadsheetEvaluation['snapshot']['sheets'][number]['cells'][string];

function getSnapshotCell(
  evaluation: SpreadsheetEvaluation,
  sheetIndex: number,
  address: string,
): SpreadsheetSnapshotCell | undefined {
  const cells = evaluation.snapshot.sheets[sheetIndex].cells;
  return Object.hasOwn(cells, address) ? cells[address] : undefined;
}

function resultText(result: SpreadsheetSnapshotCell | undefined) {
  if (result?.result.type === undefined || result.result.type === 'empty') return '';
  if (result.result.type === 'boolean') return result.result.value ? 'TRUE' : 'FALSE';
  return String(result.result.value);
}

/** Hands any editor the grid opens over to the formula bar, where all editing happens. */
function RedirectToFormulaBar({ onRedirect }: { onRedirect: () => void }) {
  // The grid only opens an editor through paths not intercepted in handleCellKeyDown.
  useEffect(onRedirect, [onRedirect]);
  return null;
}

const ERROR_DESCRIPTIONS: Partial<Record<string, string>> = {
  DIV_BY_ZERO: 'Division by zero.',
  NAME: 'Unknown function or name.',
  VALUE: 'A value has the wrong type.',
  NUM: 'A number is invalid or out of range.',
  NA: 'A value is not available.',
  CYCLE: 'The formula depends on its own value.',
  REF: 'A reference is invalid.',
  ERROR: 'The formula could not be understood.',
};

class SpreadsheetErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="alert alert-danger m-3" role="alert">
          The spreadsheet could not be loaded. Reload the page and try again.
        </div>
      );
    }
    return this.props.children;
  }
}

function SpreadsheetEditor({
  options,
  hiddenInput,
}: {
  options: SpreadsheetOptions;
  hiddenInput: HTMLInputElement;
}) {
  const { config } = options;
  const emptySubmission: SpreadsheetRawSubmission = {
    schema_version: 2,
    template_hash: config.template_hash,
    sheets: {},
  };
  const initialStateRef = useRef<{
    submission: SpreadsheetRawSubmission;
    evaluation: SpreadsheetEditorEvaluation;
    error: string;
  } | null>(null);
  if (initialStateRef.current === null) {
    const parsedInitialSubmission = SpreadsheetRawSubmissionSchema.safeParse(
      options.initial_submission,
    );
    const initialSubmission = parsedInitialSubmission.success
      ? parsedInitialSubmission.data
      : emptySubmission;
    try {
      initialStateRef.current = {
        submission: initialSubmission,
        evaluation: evaluateSpreadsheetForEditor(config, initialSubmission),
        error: '',
      };
    } catch (error) {
      initialStateRef.current = {
        submission: initialSubmission,
        evaluation: evaluateSpreadsheetForEditor(config, emptySubmission),
        error: error instanceof Error ? error.message : 'The spreadsheet could not be loaded.',
      };
    }
  }

  const [rawSubmission, setRawSubmission] = useState(initialStateRef.current.submission);
  const [evaluation, setEvaluation] = useState(initialStateRef.current.evaluation);
  // The evaluation of the uncommitted formula bar text, so cells show live values.
  const [draftEvaluation, setDraftEvaluation] = useState<SpreadsheetEditorEvaluation | null>(null);
  const draftFrameRef = useRef<number | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [formulaText, setFormulaText] = useState('');
  const [formulaFocused, setFormulaFocused] = useState(false);
  const [announcement, setAnnouncement] = useState(initialStateRef.current.error);
  const [past, setPast] = useState<SpreadsheetRawSubmission[]>([]);
  const [future, setFuture] = useState<SpreadsheetRawSubmission[]>([]);
  const gridRef = useRef<DataGridHandle>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const skipFormulaBlurRef = useRef(false);
  const rawSubmissionRef = useRef(rawSubmission);
  const committedSubmissionRef = useRef(rawSubmission);
  const dragAnchorRef = useRef<CellPosition | null>(null);
  const dragFocusRef = useRef<CellPosition | null>(null);
  const didDragRangeRef = useRef(false);
  const fillDragRef = useRef<{ source: CellPosition; target: CellPosition } | null>(null);
  const suppressActiveAnnouncementRef = useRef(false);
  // Whether formula bar editing started from the grid, so Enter and Tab return there.
  const editOriginRef = useRef<'grid' | 'bar'>('bar');
  const formulaInputRef = useRef<FormulaInputHandle>(null);
  // The corners of the reference most recently pointed at from the formula bar.
  const pointerRef = useRef<CellRange | null>(null);
  const pointingDragRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);

  const sheet = config.template.sheets[activeSheetIndex];
  const instructionsId = `pl-spreadsheet-instructions-${options.uuid}`;
  const errorId = `pl-spreadsheet-error-${options.uuid}`;
  const valueErrorId = `pl-spreadsheet-value-error-${options.uuid}`;

  function applySubmission(
    nextSubmission: SpreadsheetRawSubmission,
    message: string,
    recordHistory = true,
    formulaCell = activeCell,
    missing = '',
  ) {
    clearDraftEvaluation();
    const previousSubmission = committedSubmissionRef.current;
    if (recordHistory) {
      setPast((history) => [...history.slice(-99), previousSubmission]);
      setFuture([]);
    }
    committedSubmissionRef.current = nextSubmission;
    rawSubmissionRef.current = nextSubmission;
    setRawSubmission(nextSubmission);
    syncHiddenInput(hiddenInput, nextSubmission);
    if (formulaCell) {
      setFormulaText(
        displayInput(
          finalInput(
            config,
            nextSubmission,
            sheet.name,
            cellAddress(formulaCell.row, formulaCell.column),
          ),
        ),
      );
    }
    try {
      const nextEvaluation = evaluateSpreadsheetForEditor(config, nextSubmission);
      setEvaluation(nextEvaluation);
      let editorError = '';
      for (const [sheetName, sheetIssues] of Object.entries(nextEvaluation.issues)) {
        if (!sheetIssues) continue;
        for (const [address, issue] of Object.entries(sheetIssues)) {
          if (!issue) continue;
          editorError = `${sheetName}!${address}: ${issue.message}`;
          break;
        }
        if (editorError) break;
      }
      let calculationError = '';
      for (const evaluatedSheet of nextEvaluation.snapshot.sheets) {
        for (const [address, cell] of Object.entries(evaluatedSheet.cells)) {
          if (cell.result.type === 'error') {
            calculationError = `${evaluatedSheet.name}!${address} contains ${cell.result.value}.`;
            break;
          }
        }
        if (calculationError) break;
      }
      // A missing part of an incomplete formula explains its errors better than they do.
      setAnnouncement(missing || editorError || calculationError || message);
    } catch (error) {
      setAnnouncement(
        error instanceof Error ? error.message : 'The spreadsheet could not be recalculated.',
      );
    }
  }

  /** Evaluates the latest draft once per frame, so fast typing does not queue evaluations. */
  function scheduleDraftEvaluation() {
    if (draftFrameRef.current !== null) return;
    draftFrameRef.current = requestAnimationFrame(() => {
      draftFrameRef.current = null;
      const draft = rawSubmissionRef.current;
      if (draft === committedSubmissionRef.current) return;
      try {
        setDraftEvaluation(evaluateSpreadsheetForEditor(config, draft));
      } catch {
        // A draft that cannot be evaluated keeps showing the previous values until it can.
      }
    });
  }

  function clearDraftEvaluation() {
    if (draftFrameRef.current !== null) cancelAnimationFrame(draftFrameRef.current);
    draftFrameRef.current = null;
    setDraftEvaluation(null);
  }

  function updateDraft(row: number, column: number, inputText: string) {
    const nextSubmission = updateOverride({
      config,
      rawSubmission: committedSubmissionRef.current,
      sheetName: sheet.name,
      address: cellAddress(row, column),
      input: parseEditorInput(inputText),
    });
    rawSubmissionRef.current = nextSubmission;
    syncHiddenInput(hiddenInput, nextSubmission);
    scheduleDraftEvaluation();
  }

  function cancelDraft(formulaCell = activeCell) {
    clearDraftEvaluation();
    rawSubmissionRef.current = committedSubmissionRef.current;
    syncHiddenInput(hiddenInput, committedSubmissionRef.current);
    if (formulaCell) {
      setFormulaText(
        displayInput(
          finalInput(
            config,
            committedSubmissionRef.current,
            sheet.name,
            cellAddress(formulaCell.row, formulaCell.column),
          ),
        ),
      );
    }
  }

  function commitCell(row: number, column: number, inputText: string, message = 'Cell updated.') {
    if (!isCellEditable(sheet, row, column)) {
      setAnnouncement(`Cell ${cellAddress(row, column)} is read-only.`);
      return;
    }
    const address = cellAddress(row, column);
    const formulaText = closeTrailingParentheses(inputText);
    const input = parseEditorInput(formulaText);
    const committedInput = finalInput(config, committedSubmissionRef.current, sheet.name, address);
    if (Object.is(input, committedInput)) {
      cancelDraft({ row, column });
      return;
    }
    applySubmission(
      updateOverride({
        config,
        rawSubmission: committedSubmissionRef.current,
        sheetName: sheet.name,
        address,
        input,
      }),
      `${address}: ${message}`,
      true,
      { row, column },
      run(() => {
        const missing = describeFirstHole(formulaText);
        return missing ? `${address}: ${missing}` : '';
      }),
    );
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    const currentSubmission = committedSubmissionRef.current;
    setPast((history) => history.slice(0, -1));
    setFuture((history) => [currentSubmission, ...history].slice(0, 100));
    applySubmission(previous, 'Undid the last spreadsheet change.', false);
  }

  function redo() {
    const next = future[0];
    if (future.length === 0) return;
    const currentSubmission = committedSubmissionRef.current;
    setFuture((history) => history.slice(1));
    setPast((history) => [...history.slice(-99), currentSubmission]);
    applySubmission(next, 'Redid the spreadsheet change.', false);
  }

  /** Commits several cells as one change, skipping read-only and unchanged cells. */
  function commitCells(
    edits: { row: number; column: number; input: SpreadsheetCellInput | null }[],
    message: string,
  ) {
    let nextSubmission = committedSubmissionRef.current;
    let changed = false;
    for (const { row, column, input } of edits) {
      const address = cellAddress(row, column);
      if (
        !isCellEditable(sheet, row, column) ||
        Object.is(input, finalInput(config, nextSubmission, sheet.name, address))
      ) {
        continue;
      }
      nextSubmission = updateOverride({
        config,
        rawSubmission: nextSubmission,
        sheetName: sheet.name,
        address,
        input,
      });
      changed = true;
    }
    if (changed) applySubmission(nextSubmission, message);
  }

  /** Fills the cells from `source` (exclusive) to `target` along a single row or column. */
  function fillLine(source: CellPosition, target: CellPosition) {
    const end = clampPosition(target, sheet);
    const rowDistance = Math.abs(end.row - source.row);
    const columnDistance = Math.abs(end.column - source.column);
    // Fill along whichever single row or column the target lies furthest along.
    const rowStep = rowDistance >= columnDistance ? Math.sign(end.row - source.row) : 0;
    const columnStep = rowDistance >= columnDistance ? 0 : Math.sign(end.column - source.column);
    const count = Math.max(rowDistance, columnDistance);
    const sourceInput = finalInput(
      config,
      rawSubmission,
      sheet.name,
      cellAddress(source.row, source.column),
    );
    const edits = [];
    for (let step = 1; step <= count; step += 1) {
      const row = source.row + rowStep * step;
      const column = source.column + columnStep * step;
      edits.push({
        row,
        column,
        input: getRelativeFillInput(sourceInput, {
          rowOffset: row - source.row,
          columnOffset: column - source.column,
        }),
      });
    }
    if (edits.length === 0) return;
    const first = edits[0];
    const last = edits[edits.length - 1];
    const range =
      first === last
        ? cellAddress(first.row, first.column)
        : `${cellAddress(first.row, first.column)}:${cellAddress(last.row, last.column)}`;
    commitCells(edits, `${range}: filled from ${cellAddress(source.row, source.column)}.`);
  }

  function fillTo(targetRow: number, targetColumn: number) {
    if (!activeCell || !isCellEditable(sheet, targetRow, targetColumn)) {
      setAnnouncement('The target cell is read-only or outside the sheet.');
      return;
    }
    fillLine(activeCell, { row: targetRow, column: targetColumn });
    gridRef.current?.setActivePosition({ idx: targetColumn + 1, rowIdx: targetRow });
  }

  /**
   * Moves editing of the active cell to the formula bar, replacing its contents with
   * `replaceWith` when a key was typed, and flashes the bar so the jump is noticed.
   */
  function beginEdit(position: CellPosition, replaceWith?: string) {
    const address = cellAddress(position.row, position.column);
    if (!isCellEditable(sheet, position.row, position.column)) {
      setAnnouncement(`Cell ${address} is read-only.`);
      return;
    }
    editOriginRef.current = 'grid';
    const text =
      replaceWith ??
      displayInput(finalInput(config, committedSubmissionRef.current, sheet.name, address));
    setFormulaText(text);
    if (replaceWith !== undefined) updateDraft(position.row, position.column, replaceWith);
    formulaInputRef.current?.focusAt(text.length);
    formulaInputRef.current?.flash();
  }

  /** Commits the formula bar and, if editing started in the grid, moves to `target`. */
  function finishEdit(target: CellPosition | null) {
    if (!activeCell) return;
    skipFormulaBlurRef.current = true;
    commitCell(activeCell.row, activeCell.column, formulaText);
    if (editOriginRef.current === 'grid' && target) {
      // Keep the announcement of what the commit left missing.
      suppressActiveAnnouncementRef.current = true;
      selectCell(target);
    } else {
      focusActiveCell();
    }
    editOriginRef.current = 'bar';
  }

  /** The formula bar always edits the active cell, so setActivePosition would not move focus. */
  function focusActiveCell() {
    editorRef.current
      ?.querySelector<HTMLElement>('[role="gridcell"][aria-selected="true"]')
      ?.focus();
  }

  /** Writes the reference spanned by `pointer` into the formula bar's point-mode target. */
  function pointAt(target: { start: number; end: number }, pointer: CellRange) {
    pointerRef.current = pointer;
    const reference = formatReference(pointer.anchor, pointer.focus);
    formulaInputRef.current?.writeReference(target.start, target.end, reference);
    setAnnouncement(`Inserted reference ${reference}.`);
  }

  function selectCell(position: CellPosition, shouldFocus = true) {
    setSelectedRange({ anchor: position, focus: position });
    gridRef.current?.setActivePosition(
      { idx: position.column + 1, rowIdx: position.row },
      { shouldFocus },
    );
  }

  function getTabTarget(position: CellPosition, backwards: boolean): CellPosition | null {
    const offset = backwards ? -1 : 1;
    const index = position.row * sheet.columns + position.column + offset;
    if (index < 0 || index >= sheet.rows * sheet.columns) return null;
    return {
      row: Math.floor(index / sheet.columns),
      column: index % sheet.columns,
    };
  }

  function getVerticalTarget(position: CellPosition, upwards: boolean): CellPosition {
    return {
      row: Math.max(0, Math.min(sheet.rows - 1, position.row + (upwards ? -1 : 1))),
      column: position.column,
    };
  }

  const shownEvaluation = draftEvaluation ?? evaluation;
  const rows: SpreadsheetRow[] = Array.from({ length: sheet.rows }, (_, rowIndex) => {
    const inputs: Record<string, string> = {};
    const results: Record<string, string> = {};
    const errors: Record<string, boolean> = {};
    for (let column = 0; column < sheet.columns; column += 1) {
      const columnName = cellAddress(0, column).replace(/1$/, '');
      const address = cellAddress(rowIndex, column);
      inputs[columnName] = displayInput(finalInput(config, rawSubmission, sheet.name, address));
      const snapshotCell = getSnapshotCell(shownEvaluation, activeSheetIndex, address);
      results[columnName] = resultText(snapshotCell);
      errors[columnName] = snapshotCell?.result.type === 'error';
    }
    return { rowIndex, inputs, results, errors };
  });

  const pointedRanges = run(() => {
    if (!formulaFocused || !formulaText.startsWith('=')) return [];
    return formulaReferences(tokenizeFormula(formulaText.slice(1))).flatMap((reference) => {
      const resolved = resolveReference(reference.token.text, sheet);
      if (!resolved || (resolved.sheetName !== null && resolved.sheetName !== sheet.name)) {
        return [];
      }
      return [{ range: resolved.range, colorIndex: reference.colorIndex }];
    });
  });

  function referenceCellClass(row: number, column: number) {
    // Later references are drawn over earlier ones.
    const reference = pointedRanges
      .filter(
        ({ range }) =>
          row >= range.startRow &&
          row <= range.endRow &&
          column >= range.startColumn &&
          column <= range.endColumn,
      )
      .at(-1);
    if (!reference) return undefined;
    const { range, colorIndex } = reference;
    return clsx(`pl-spreadsheet-ref-cell pl-spreadsheet-ref-fill-${colorIndex}`, {
      'pl-spreadsheet-ref-top': row === range.startRow,
      'pl-spreadsheet-ref-bottom': row === range.endRow,
      'pl-spreadsheet-ref-left': column === range.startColumn,
      'pl-spreadsheet-ref-right': column === range.endColumn,
    });
  }

  const columns: readonly Column<SpreadsheetRow>[] = [
    {
      key: '__row',
      name: '#',
      width: 56,
      frozen: true,
      renderCell: ({ row }) => (
        <span className="pl-spreadsheet-row-header">{row.rowIndex + 1}</span>
      ),
    },
    ...Array.from({ length: sheet.columns }, (_, columnIndex): Column<SpreadsheetRow> => {
      const columnName = cellAddress(0, columnIndex).replace(/1$/, '');
      return {
        key: columnName,
        name: columnName,
        minWidth: 96,
        resizable: true,
        editable: (row) => isCellEditable(sheet, row.rowIndex, columnIndex),
        cellClass: (row) =>
          clsx(
            {
              'pl-spreadsheet-cell-readonly': !isCellEditable(sheet, row.rowIndex, columnIndex),
              'pl-spreadsheet-cell-selected': isCellInRange(
                selectedRange,
                row.rowIndex,
                columnIndex,
              ),
            },
            referenceCellClass(row.rowIndex, columnIndex),
          ),
        // Paste and fill need an editor; editing itself happens in the formula bar.
        renderEditCell: ({ row, onClose }) => (
          <RedirectToFormulaBar
            onRedirect={() => {
              onClose(false, false);
              beginEdit({ row: row.rowIndex, column: columnIndex });
            }}
          />
        ),
        renderCell: ({ row }) => {
          const address = `${columnName}${row.rowIndex + 1}`;
          const editable = isCellEditable(sheet, row.rowIndex, columnIndex);
          const issue = shownEvaluation.issues[sheet.name]?.[address];
          return (
            <span
              className={row.errors[columnName] ? 'pl-spreadsheet-cell-error' : undefined}
              aria-label={`${address}, ${editable ? 'editable' : 'read-only'}, ${row.results[columnName] || 'blank'}`}
              title={issue?.message ?? (editable ? undefined : 'Read-only cell')}
            >
              {row.results[columnName]}
              {!editable && <span className="visually-hidden"> Read-only</span>}
            </span>
          );
        },
      };
    }),
  ];

  // Flush the latest state for both normal form submission and the FormData event path.
  useEffect(() => {
    const form = hiddenInput.form;
    syncHiddenInput(hiddenInput, rawSubmissionRef.current);
    if (!form) return;
    const flush = () => syncHiddenInput(hiddenInput, rawSubmissionRef.current);
    const flushFormData = (event: FormDataEvent) => {
      const value = JSON.stringify(rawSubmissionRef.current);
      hiddenInput.value = value;
      event.formData.set(hiddenInput.name, value);
    };
    form.addEventListener('submit', flush);
    form.addEventListener('formdata', flushFormData);
    return () => {
      form.removeEventListener('submit', flush);
      form.removeEventListener('formdata', flushFormData);
    };
  }, [hiddenInput]);

  // Drop a draft evaluation still scheduled when the element is removed.
  useEffect(
    () => () => {
      if (draftFrameRef.current !== null) cancelAnimationFrame(draftFrameRef.current);
    },
    [],
  );

  // React Data Grid does not expose a cell-role hook, so keep virtualized row-number cells semantic.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const applyRowHeaderRoles = () => {
      for (const cell of editor.querySelectorAll('[role="gridcell"][aria-colindex="1"]')) {
        cell.setAttribute('role', 'rowheader');
      }
    };
    applyRowHeaderRoles();
    const observer = new MutationObserver(applyRowHeaderRoles);
    observer.observe(editor, {
      attributeFilter: ['role'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  // While popped out, keep the page behind from scrolling and keep focus inside the popup.
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keepFocusInside = (event: FocusEvent) => {
      const editor = editorRef.current;
      if (editor && event.target instanceof Node && !editor.contains(event.target)) {
        editor.querySelector<HTMLElement>('.pl-spreadsheet-popup-close')?.focus();
      }
    };
    // Listening on the document runs after React's handlers, so Escape first leaves any
    // edit in progress (which prevents the default), and only then closes the popup.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closePopup();
    };
    document.addEventListener('focusin', keepFocusInside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('focusin', keepFocusInside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [expanded]);

  function closePopup() {
    setExpanded(false);
    expandButtonRef.current?.focus();
  }

  // Track range selection outside React Data Grid, which only exposes a single active cell.
  useEffect(() => {
    const bounds = { rows: sheet.rows, columns: sheet.columns };

    function handleMouseMove(event: MouseEvent) {
      if (pointingDragRef.current) {
        event.preventDefault();
        const focus = cellAtPoint(editorRef.current, bounds, event.clientX, event.clientY);
        const pointer = pointerRef.current;
        const target = formulaInputRef.current?.pointingTarget();
        if (!focus || !pointer || !target?.continuing) return;
        if (pointer.focus.row === focus.row && pointer.focus.column === focus.column) return;
        pointAt(target, { anchor: pointer.anchor, focus });
        return;
      }
      const anchor = dragAnchorRef.current;
      if (!anchor) return;
      event.preventDefault();
      const focus = cellAtPoint(editorRef.current, bounds, event.clientX, event.clientY);
      if (!focus) return;
      const previousFocus = dragFocusRef.current;
      if (previousFocus?.row === focus.row && previousFocus.column === focus.column) return;
      dragFocusRef.current = focus;
      didDragRangeRef.current = focus.row !== anchor.row || focus.column !== anchor.column;
      setSelectedRange({ anchor, focus });
      gridRef.current?.setActivePosition(
        { idx: focus.column + 1, rowIdx: focus.row },
        { shouldFocus: false },
      );
    }

    function handleMouseUp() {
      pointingDragRef.current = false;
      if (!dragAnchorRef.current) return;
      const focus = dragFocusRef.current;
      dragAnchorRef.current = null;
      dragFocusRef.current = null;
      if (didDragRangeRef.current && focus) {
        gridRef.current?.setActivePosition(
          { idx: focus.column + 1, rowIdx: focus.row },
          { shouldFocus: true },
        );
      }
      didDragRangeRef.current = false;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sheet.columns, sheet.rows]);

  function handleRowsChange(nextRows: SpreadsheetRow[], data: RowsChangeData<SpreadsheetRow>) {
    if (data.column.key === '__row') return;
    const parsedColumn = parseCellAddress(`${data.column.key}1`);
    if (!parsedColumn) return;
    if (data.indexes.length === 1) {
      const row = nextRows[data.indexes[0]];
      commitCell(row.rowIndex, parsedColumn.column, row.inputs[data.column.key]);
      return;
    }
    // Double-clicking the fill handle fills the rest of the column at once.
    commitCells(
      data.indexes.map((index) => ({
        row: nextRows[index].rowIndex,
        column: parsedColumn.column,
        input: parseEditorInput(nextRows[index].inputs[data.column.key]),
      })),
      'Filled the rest of the column from the active cell.',
    );
  }

  /** The end of a fill handle drag from `source`, kept to the row or column it moves along most. */
  function fillTarget(source: CellPosition, clientX: number, clientY: number) {
    const cell = cellAtPoint(editorRef.current, sheet, clientX, clientY);
    if (!cell) return null;
    return Math.abs(cell.row - source.row) >= Math.abs(cell.column - source.column)
      ? { row: cell.row, column: source.column }
      : { row: source.row, column: cell.column };
  }

  function handleFill(event: FillEvent<SpreadsheetRow>): SpreadsheetRow {
    const parsedColumn = parseCellAddress(`${event.columnKey}1`);
    if (!parsedColumn) return event.targetRow;
    const sourceInput = finalInput(
      config,
      rawSubmission,
      sheet.name,
      cellAddress(event.sourceRow.rowIndex, parsedColumn.column),
    );
    const input = getRelativeFillInput(sourceInput, {
      rowOffset: event.targetRow.rowIndex - event.sourceRow.rowIndex,
      columnOffset: 0,
    });
    return {
      ...event.targetRow,
      inputs: {
        ...event.targetRow.inputs,
        [event.columnKey]: displayInput(input),
      },
    };
  }

  function handleCellKeyDown(args: CellKeyDownArgs<SpreadsheetRow>, event: CellKeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.preventGridDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (!args.column || args.column.key === '__row') return;

    const position = { row: args.rowIdx, column: args.column.idx - 1 };
    if (args.mode === 'ACTIVE' && event.key === 'F2') {
      event.preventDefault();
      event.preventGridDefault();
      beginEdit(position);
      return;
    }

    if (args.mode === 'ACTIVE' && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      event.preventGridDefault();
      commitCell(position.row, position.column, '', 'Cell cleared.');
      return;
    }

    if (
      args.mode === 'ACTIVE' &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      isCellEditable(sheet, position.row, position.column)
    ) {
      event.preventDefault();
      event.preventGridDefault();
      beginEdit(position, event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.preventGridDefault();
      if (args.mode === 'EDIT') args.onClose(true, false);
      const target = getVerticalTarget(position, event.shiftKey);
      suppressActiveAnnouncementRef.current =
        args.mode === 'EDIT' && (target.row !== position.row || target.column !== position.column);
      selectCell(target);
      return;
    }

    if (event.key === 'Tab') {
      const target = getTabTarget(position, event.shiftKey);
      if (!target) {
        // Let the browser move focus out of the grid at either boundary.
        event.preventGridDefault();
        return;
      }
      event.preventDefault();
      event.preventGridDefault();
      if (args.mode === 'EDIT') args.onClose(true, false);
      suppressActiveAnnouncementRef.current = args.mode === 'EDIT';
      selectCell(target);
      return;
    }

    if (
      args.mode === 'ACTIVE' &&
      event.shiftKey &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      event.preventDefault();
      event.preventGridDefault();
      const target = {
        row: Math.max(
          0,
          Math.min(
            sheet.rows - 1,
            position.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0),
          ),
        ),
        column: Math.max(
          0,
          Math.min(
            sheet.columns - 1,
            position.column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
          ),
        ),
      };
      const anchor = selectedRange?.anchor ?? position;
      gridRef.current?.setActivePosition(
        { idx: target.column + 1, rowIdx: target.row },
        { shouldFocus: true },
      );
      setSelectedRange({ anchor, focus: target });
    }
  }

  const activeValueError = run(() => {
    if (!activeCell) return '';
    const address = cellAddress(activeCell.row, activeCell.column);
    // An incomplete formula also fails reference checks, but what is missing says more.
    const missing = formulaText.startsWith('=') ? describeFirstHole(formulaText) : null;
    if (missing) return missing;
    const issue = shownEvaluation.issues[sheet.name]?.[address];
    if (issue) return issue.message;
    const result = getSnapshotCell(shownEvaluation, activeSheetIndex, address)?.result;
    if (result?.type !== 'error') return '';
    return `${result.value} ${ERROR_DESCRIPTIONS[result.error_type] ?? 'The formula could not be calculated.'}`;
  });

  return (
    <>
      {expanded && (
        // Keyboard users close the popup with Escape or its close button instead.
        // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions
        <div className="pl-spreadsheet-popup-backdrop" onClick={closePopup} />
      )}
      <div
        ref={editorRef}
        className={clsx('pl-spreadsheet-editor', expanded && 'is-expanded')}
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label={expanded ? options.aria_label : undefined}
        onPointerDownCapture={(event) => {
          if (
            event.button !== 0 ||
            !activeCell ||
            !(event.target instanceof Element) ||
            !event.target.classList.contains('rdg-cell-drag-handle')
          ) {
            return;
          }
          // React Data Grid's fill handle only fills down a column, so drive it here instead.
          event.preventDefault();
          event.stopPropagation();
          event.target.setPointerCapture(event.pointerId);
          fillDragRef.current = { source: activeCell, target: activeCell };
        }}
        onPointerMove={(event) => {
          // Moving the mouse over the sheet hides the formula bar's popups so the cells under
          // them can be seen. Some browsers send a move without movement when the content under
          // a resting pointer changes, e.g. as a popup opens.
          if (
            event.pointerType === 'mouse' &&
            (event.movementX !== 0 || event.movementY !== 0) &&
            !(
              event.target instanceof Element &&
              event.target.closest('.pl-spreadsheet-formula-popup')
            )
          ) {
            formulaInputRef.current?.hidePopups();
          }
          const drag = fillDragRef.current;
          if (!drag) return;
          const target = fillTarget(drag.source, event.clientX, event.clientY);
          if (!target || (target.row === drag.target.row && target.column === drag.target.column)) {
            return;
          }
          drag.target = target;
          setSelectedRange({ anchor: drag.source, focus: target });
          gridRef.current?.scrollToCell({ idx: target.column + 1, rowIdx: target.row });
        }}
        onPointerUp={() => {
          const drag = fillDragRef.current;
          if (!drag) return;
          fillDragRef.current = null;
          fillLine(drag.source, drag.target);
        }}
        onLostPointerCapture={() => {
          const drag = fillDragRef.current;
          if (!drag) return;
          fillDragRef.current = null;
          setSelectedRange({ anchor: drag.source, focus: drag.source });
        }}
      >
        {expanded && (
          <div className="pl-spreadsheet-popup-header">
            <span>{options.aria_label}</span>
            <button
              type="button"
              className="btn-close pl-spreadsheet-popup-close"
              aria-label="Close full-screen spreadsheet"
              onClick={closePopup}
            />
          </div>
        )}
        <p id={instructionsId} className="visually-hidden">
          Click a cell to select it. Start typing to replace its contents, or double-click or press
          F2 to edit its existing contents; either moves you to the formula bar, and Enter or Tab
          saves and returns to the grid. Delete or Backspace clears a cell. Drag or hold Shift with
          an arrow key to select a range. Use Enter and Shift+Enter to move vertically, Tab and
          Shift+Tab to move horizontally, and Escape to cancel editing. Tab leaves the grid at its
          boundaries. Read-only cells are announced. While typing a formula in the formula bar, use
          the Up and Down arrow keys to choose a suggested function and Enter or Tab to insert it.
          Where the formula expects a value, click or drag across cells to insert a cell reference;
          right after that, the arrow keys move the reference and Shift with the arrow keys resizes
          it. Tab and Shift+Tab move between the missing parts of a formula.
        </p>
        <div className="pl-spreadsheet-toolbar" role="toolbar" aria-label="Spreadsheet actions">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={past.length === 0}
            onClick={undo}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={future.length === 0}
            onClick={redo}
          >
            Redo
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={!activeCell || activeCell.row >= sheet.rows - 1}
            onClick={() => activeCell && fillTo(activeCell.row + 1, activeCell.column)}
          >
            Fill down
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={!activeCell || activeCell.column >= sheet.columns - 1}
            onClick={() => activeCell && fillTo(activeCell.row, activeCell.column + 1)}
          >
            Fill right
          </button>
          <button
            ref={expandButtonRef}
            type="button"
            className="btn btn-sm btn-outline-secondary ms-auto"
            aria-label={expanded ? 'Exit full screen' : 'Open spreadsheet full screen'}
            title={expanded ? 'Exit full screen' : 'Open full screen'}
            onClick={() => setExpanded(!expanded)}
          >
            <i
              className={clsx('bi', expanded ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen')}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="pl-spreadsheet-formula-bar">
          {/* Space is always reserved so the formula bar does not move as errors come and go. */}
          <div id={valueErrorId} className="pl-spreadsheet-value-error" title={activeValueError}>
            {activeValueError}
          </div>
          <label htmlFor={`${instructionsId}-formula`}>
            {activeCell ? cellAddress(activeCell.row, activeCell.column) : 'Cell'}
          </label>
          <FormulaInput
            ref={formulaInputRef}
            id={`${instructionsId}-formula`}
            aria-label={
              activeCell
                ? `Formula for ${cellAddress(activeCell.row, activeCell.column)}`
                : 'Formula bar'
            }
            aria-describedby={`${instructionsId} ${valueErrorId}`}
            disabled={!activeCell || !isCellEditable(sheet, activeCell.row, activeCell.column)}
            value={formulaText}
            onValueChange={(value) => {
              setFormulaText(value);
              if (activeCell) updateDraft(activeCell.row, activeCell.column, value);
            }}
            onAnnounce={setAnnouncement}
            onFocus={() => setFormulaFocused(true)}
            onBlur={() => {
              setFormulaFocused(false);
              editOriginRef.current = 'bar';
              if (skipFormulaBlurRef.current) {
                skipFormulaBlurRef.current = false;
              } else if (activeCell) {
                commitCell(activeCell.row, activeCell.column, formulaText);
              }
            }}
            onKeyDown={(event) => {
              const offset = ARROW_OFFSETS[event.key];
              // Right after pointing at cells, the arrow keys adjust that reference; after
              // typing, they move the caret as usual.
              const pointingTarget =
                offset && !event.altKey && !event.ctrlKey && !event.metaKey
                  ? formulaInputRef.current?.pointingTarget()
                  : null;
              const pointer = pointingTarget?.continuing ? pointerRef.current : null;
              if (offset && pointingTarget && pointer) {
                event.preventDefault();
                const focus = clampPosition(
                  {
                    row: pointer.focus.row + offset.row,
                    column: pointer.focus.column + offset.column,
                  },
                  sheet,
                );
                pointAt(pointingTarget, { anchor: event.shiftKey ? pointer.anchor : focus, focus });
              } else if (event.key === 'Enter' && activeCell) {
                event.preventDefault();
                finishEdit(getVerticalTarget(activeCell, event.shiftKey));
              } else if (event.key === 'Tab' && activeCell && editOriginRef.current === 'grid') {
                event.preventDefault();
                finishEdit(getTabTarget(activeCell, event.shiftKey));
              } else if (event.key === 'Escape' && activeCell) {
                event.preventDefault();
                skipFormulaBlurRef.current = true;
                cancelDraft();
                focusActiveCell();
                editOriginRef.current = 'bar';
              }
            }}
          />
        </div>
        <DataGrid
          ref={gridRef}
          className="rdg-light pl-spreadsheet-grid"
          aria-label={`${options.aria_label}, sheet ${sheet.name}`}
          aria-describedby={instructionsId}
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.rowIndex}
          onRowsChange={handleRowsChange}
          onFill={handleFill}
          onCellMouseDown={({ rowIdx, column }, event) => {
            if (event.button !== 0 || column.key === '__row') return;
            const position = { row: rowIdx, column: column.idx - 1 };
            const pointingTarget = formulaInputRef.current?.pointingTarget();
            if (pointingTarget) {
              // Keep focus and the active cell on the formula being edited.
              event.preventDefault();
              event.preventGridDefault();
              pointingDragRef.current = true;
              const anchor =
                event.shiftKey && pointingTarget.continuing && pointerRef.current
                  ? pointerRef.current.anchor
                  : position;
              pointAt(pointingTarget, { anchor, focus: position });
              return;
            }
            const anchor = event.shiftKey && selectedRange ? selectedRange.anchor : position;
            dragAnchorRef.current = anchor;
            dragFocusRef.current = position;
            didDragRangeRef.current = false;
            setSelectedRange({ anchor, focus: position });
          }}
          onCellCopy={({ row, column }, event) => {
            if (column.key === '__row') return;
            event.clipboardData.setData('text/plain', row.inputs[column.key] ?? '');
            event.preventDefault();
          }}
          onCellPaste={({ row, column }, event) => ({
            ...row,
            inputs: {
              ...row.inputs,
              [column.key]: event.clipboardData.getData('text/plain').split(/\r?\n/, 1)[0],
            },
          })}
          onActivePositionChange={({ rowIdx, column }) => {
            if (!column || column.key === '__row' || rowIdx < 0) {
              setActiveCell(null);
              return;
            }
            const parsedColumn = parseCellAddress(`${column.key}1`);
            if (!parsedColumn) return;
            const sourceRow = rows[rowIdx].rowIndex;
            const position = { row: sourceRow, column: parsedColumn.column };
            setActiveCell(position);
            if (!dragAnchorRef.current) setSelectedRange({ anchor: position, focus: position });
            const address = cellAddress(sourceRow, parsedColumn.column);
            setFormulaText(
              displayInput(finalInput(config, committedSubmissionRef.current, sheet.name, address)),
            );
            if (suppressActiveAnnouncementRef.current) {
              suppressActiveAnnouncementRef.current = false;
              return;
            }
            const editable = isCellEditable(sheet, sourceRow, parsedColumn.column);
            const snapshotCell = getSnapshotCell(evaluation, activeSheetIndex, address);
            const issue = evaluation.issues[sheet.name]?.[address];
            if (issue) {
              setAnnouncement(
                `${address}, ${editable ? 'editable' : 'read-only'}, contains ${issue.value}. ${issue.message}`,
              );
            } else if (snapshotCell?.result.type === 'error') {
              setAnnouncement(
                `${address}, ${editable ? 'editable' : 'read-only'}, contains ${snapshotCell.result.value}.`,
              );
            } else {
              setAnnouncement(
                `${address}, ${editable ? 'editable' : 'read-only'}, ${resultText(snapshotCell) || 'blank'}.`,
              );
            }
          }}
          onCellKeyDown={handleCellKeyDown}
          onCellDoubleClick={({ rowIdx, column }, event) => {
            if (column.key === '__row') return;
            event.preventGridDefault();
            beginEdit({ row: rowIdx, column: column.idx - 1 });
          }}
        />
        {config.template.sheets.length > 1 && (
          <div className="pl-spreadsheet-sheet-tabs" role="tablist" aria-label="Workbook sheets">
            {config.template.sheets.map((candidate, index) => (
              <button
                key={candidate.name}
                type="button"
                className="pl-spreadsheet-sheet-tab"
                role="tab"
                aria-selected={index === activeSheetIndex}
                tabIndex={index === activeSheetIndex ? 0 : -1}
                onClick={() => {
                  setActiveSheetIndex(index);
                  setActiveCell(null);
                  setSelectedRange(null);
                  setFormulaText('');
                  setAnnouncement(`Opened sheet ${candidate.name}.`);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  const offset = event.key === 'ArrowRight' ? 1 : -1;
                  const nextIndex =
                    (activeSheetIndex + offset + config.template.sheets.length) %
                    config.template.sheets.length;
                  setActiveSheetIndex(nextIndex);
                  setActiveCell(null);
                  setSelectedRange(null);
                  setFormulaText('');
                  const tabs =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    );
                  tabs?.[nextIndex]?.focus();
                }}
              >
                {candidate.name}
              </button>
            ))}
          </div>
        )}
        <div id={errorId} className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </>
  );
}

/** Resolves a specifier through the page's import maps, which list each element's dynamic dependencies. */
function resolveImportMapUrl(specifier: string): string {
  for (const script of document.querySelectorAll('script[type="importmap"]')) {
    const importMap: { imports?: Record<string, string> } = JSON.parse(script.textContent);
    const url = importMap.imports?.[specifier];
    if (url) return url;
  }
  throw new Error(`${specifier} is not in the import map.`);
}

let spreadsheetEngineLoad: Promise<void> | null = null;

/** Fetches and instantiates the spreadsheet engine once for every spreadsheet on the page. */
function loadSpreadsheetEngine(): Promise<void> {
  spreadsheetEngineLoad ??= (async () => {
    const response = await fetch(resolveImportMapUrl(SPREADSHEET_ENGINE_WASM_PATH));
    if (!response.ok) throw new Error('The spreadsheet engine could not be downloaded.');
    const { instance } = await WebAssembly.instantiate(
      await response.arrayBuffer(),
      spreadsheetEngineImports(),
    );
    initializeSpreadsheetEngine(instance);
  })();
  return spreadsheetEngineLoad;
}

onDocumentReady(() => {
  observe('.js-pl-spreadsheet-formula-toggle', {
    constructor: HTMLInputElement,
    initialize(toggle) {
      const readOnlySpreadsheet = toggle.closest('.pl-spreadsheet-read-only');
      if (!readOnlySpreadsheet) return;

      const updateView = () =>
        readOnlySpreadsheet.classList.toggle('is-showing-formulas', toggle.checked);

      toggle.checked = false;
      updateView();
      toggle.addEventListener('change', updateView);
      return { remove: () => toggle.removeEventListener('change', updateView) };
    },
  });

  observe('.pl-spreadsheet-root', {
    constructor: HTMLDivElement,
    initialize(element) {
      const showLoadError = () => {
        element.innerHTML = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger m-3';
        alert.role = 'alert';
        alert.textContent = 'The spreadsheet could not be loaded. Reload the page and try again.';
        element.append(alert);
      };
      const hiddenInput = element.parentElement?.querySelector<HTMLInputElement>(
        '.js-pl-spreadsheet-input',
      );
      try {
        if (!hiddenInput || !element.dataset.options) {
          throw new Error('Spreadsheet metadata is missing.');
        }
        const options = JSON.parse(atob(element.dataset.options)) as SpreadsheetOptions;
        const root = createRoot(element);
        let removed = false;
        loadSpreadsheetEngine().then(
          () => {
            if (removed) return;
            root.render(
              <SpreadsheetErrorBoundary>
                <SpreadsheetEditor options={options} hiddenInput={hiddenInput} />
              </SpreadsheetErrorBoundary>,
            );
          },
          () => {
            if (removed) return;
            root.unmount();
            showLoadError();
          },
        );
        return {
          remove: () => {
            removed = true;
            root.unmount();
          },
        };
      } catch {
        showLoadError();
      }
    },
  });
});
