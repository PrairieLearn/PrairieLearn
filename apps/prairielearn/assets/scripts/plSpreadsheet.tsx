import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type CellKeyDownArgs,
  type CellKeyboardEvent,
  type Column,
  DataGrid,
  type DataGridHandle,
  type FillEvent,
  type RenderEditCellProps,
  type RowsChangeData,
} from 'react-data-grid';
import { createRoot } from 'react-dom/client';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

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

function displayInput(input: SpreadsheetCellInput | null | undefined): string {
  if (input == null) return '';
  if (typeof input === 'boolean') return input ? 'TRUE' : 'FALSE';
  return String(input);
}

function parseEditorInput(value: string): SpreadsheetCellInput | null {
  if (value === '') return null;
  if (value.startsWith('=')) return value;
  if (value.toUpperCase() === 'TRUE') return true;
  if (value.toUpperCase() === 'FALSE') return false;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return value;
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

function CellEditor({
  row,
  column,
  onRowChange,
  onClose,
  onDraftChange,
  onCancel,
}: RenderEditCellProps<SpreadsheetRow> & {
  onDraftChange: (value: string) => void;
  onCancel: () => void;
}) {
  const value = row.inputs[column.key] ?? '';
  return (
    <input
      className="form-control form-control-sm h-100 rounded-0"
      aria-label={`Edit cell ${column.key}${row.rowIndex + 1}`}
      value={value}
      onChange={(event) => {
        onDraftChange(event.currentTarget.value);
        onRowChange({
          ...row,
          inputs: { ...row.inputs, [column.key]: event.currentTarget.value },
        });
      }}
      onBlur={() => onClose(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onClose(true);
        if (event.key === 'Escape') {
          onCancel();
          onClose(false);
        }
      }}
    />
  );
}

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
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [activeCell, setActiveCell] = useState<{ row: number; column: number } | null>(null);
  const [formulaText, setFormulaText] = useState('');
  const [announcement, setAnnouncement] = useState(initialStateRef.current.error);
  const [past, setPast] = useState<SpreadsheetRawSubmission[]>([]);
  const [future, setFuture] = useState<SpreadsheetRawSubmission[]>([]);
  const gridRef = useRef<DataGridHandle>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const skipFormulaBlurRef = useRef(false);
  const rawSubmissionRef = useRef(rawSubmission);
  const committedSubmissionRef = useRef(rawSubmission);

  const sheet = config.template.sheets[activeSheetIndex];
  const instructionsId = `pl-spreadsheet-instructions-${options.uuid}`;
  const errorId = `pl-spreadsheet-error-${options.uuid}`;

  function applySubmission(
    nextSubmission: SpreadsheetRawSubmission,
    message: string,
    recordHistory = true,
  ) {
    const previousSubmission = committedSubmissionRef.current;
    if (recordHistory) {
      setPast((history) => [...history.slice(-99), previousSubmission]);
      setFuture([]);
    }
    committedSubmissionRef.current = nextSubmission;
    rawSubmissionRef.current = nextSubmission;
    setRawSubmission(nextSubmission);
    syncHiddenInput(hiddenInput, nextSubmission);
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
      setAnnouncement(editorError || calculationError || message);
    } catch (error) {
      setAnnouncement(
        error instanceof Error ? error.message : 'The spreadsheet could not be recalculated.',
      );
    }
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
  }

  function cancelDraft() {
    rawSubmissionRef.current = committedSubmissionRef.current;
    syncHiddenInput(hiddenInput, committedSubmissionRef.current);
  }

  function commitCell(row: number, column: number, inputText: string, message = 'Cell updated.') {
    if (!isCellEditable(sheet, row, column)) {
      setAnnouncement(`Cell ${cellAddress(row, column)} is read-only.`);
      return;
    }
    const address = cellAddress(row, column);
    const input = parseEditorInput(inputText);
    if (Object.is(input, finalInput(config, committedSubmissionRef.current, sheet.name, address))) {
      cancelDraft();
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

  function fillTo(targetRow: number, targetColumn: number) {
    if (!activeCell || !isCellEditable(sheet, targetRow, targetColumn)) {
      setAnnouncement('The target cell is read-only or outside the sheet.');
      return;
    }
    const sourceAddress = {
      sheet: activeSheetIndex,
      row: activeCell.row,
      col: activeCell.column,
    };
    const targetAddress = { sheet: activeSheetIndex, row: targetRow, col: targetColumn };
    const input = getRelativeFillInput(evaluation.engine, sourceAddress, targetAddress);
    commitCell(targetRow, targetColumn, displayInput(input), 'filled from the active cell.');
    gridRef.current?.setActivePosition({ idx: targetColumn + 1, rowIdx: targetRow });
  }

  const rows: SpreadsheetRow[] = Array.from({ length: sheet.rows }, (_, rowIndex) => {
    const inputs: Record<string, string> = {};
    const results: Record<string, string> = {};
    const errors: Record<string, boolean> = {};
    for (let column = 0; column < sheet.columns; column += 1) {
      const columnName = cellAddress(0, column).replace(/1$/, '');
      const address = cellAddress(rowIndex, column);
      inputs[columnName] = displayInput(finalInput(config, rawSubmission, sheet.name, address));
      const snapshotCell = getSnapshotCell(evaluation, activeSheetIndex, address);
      results[columnName] = resultText(snapshotCell);
      errors[columnName] = snapshotCell?.result.type === 'error';
    }
    return { rowIndex, inputs, results, errors };
  });

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
          isCellEditable(sheet, row.rowIndex, columnIndex)
            ? undefined
            : 'pl-spreadsheet-cell-readonly',
        renderEditCell: (props) => (
          <CellEditor
            {...props}
            onDraftChange={(value) => updateDraft(props.row.rowIndex, columnIndex, value)}
            onCancel={cancelDraft}
          />
        ),
        renderCell: ({ row }) => {
          const address = `${columnName}${row.rowIndex + 1}`;
          const editable = isCellEditable(sheet, row.rowIndex, columnIndex);
          const issue = evaluation.issues[sheet.name]?.[address];
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

  // Release HyperFormula resources when this dynamically rendered element is removed.
  useEffect(() => () => evaluation.engine.destroy(), [evaluation]);

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

  function handleRowsChange(nextRows: SpreadsheetRow[], data: RowsChangeData<SpreadsheetRow>) {
    if (data.column.key === '__row') return;
    const localRowIndex = data.indexes[0];
    const parsedColumn = parseCellAddress(`${data.column.key}1`);
    if (!parsedColumn) return;
    const row = nextRows[localRowIndex];
    commitCell(row.rowIndex, parsedColumn.column, row.inputs[data.column.key]);
  }

  function handleFill(event: FillEvent<SpreadsheetRow>): SpreadsheetRow {
    const parsedColumn = parseCellAddress(`${event.columnKey}1`);
    if (!parsedColumn) return event.targetRow;
    const sourceAddress = {
      sheet: activeSheetIndex,
      row: event.sourceRow.rowIndex,
      col: parsedColumn.column,
    };
    const targetAddress = {
      sheet: activeSheetIndex,
      row: event.targetRow.rowIndex,
      col: parsedColumn.column,
    };
    const input = getRelativeFillInput(evaluation.engine, sourceAddress, targetAddress);
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
    if (args.mode !== 'ACTIVE' || event.key !== 'Tab' || !args.column) return;
    const firstCell = args.rowIdx === 0 && args.column.idx === 1 && event.shiftKey;
    const lastCell =
      args.rowIdx === rows.length - 1 && args.column.idx === columns.length - 1 && !event.shiftKey;
    if (firstCell || lastCell) event.preventGridDefault();
  }

  return (
    <div ref={editorRef} className="pl-spreadsheet-editor">
      <p id={instructionsId} className="visually-hidden">
        Click a cell or use arrow keys and Enter or F2 to edit, Escape to cancel, and Tab to leave
        the grid at its boundaries. Read-only cells are announced.
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
      </div>
      <div className="pl-spreadsheet-formula-bar">
        <label htmlFor={`${instructionsId}-formula`}>
          {activeCell ? cellAddress(activeCell.row, activeCell.column) : 'Cell'}
        </label>
        <input
          id={`${instructionsId}-formula`}
          className="form-control form-control-sm"
          aria-label={
            activeCell
              ? `Formula for ${cellAddress(activeCell.row, activeCell.column)}`
              : 'Formula bar'
          }
          aria-describedby={instructionsId}
          disabled={!activeCell || !isCellEditable(sheet, activeCell.row, activeCell.column)}
          value={formulaText}
          onChange={(event) => {
            setFormulaText(event.currentTarget.value);
            if (activeCell) {
              updateDraft(activeCell.row, activeCell.column, event.currentTarget.value);
            }
          }}
          onBlur={() => {
            if (skipFormulaBlurRef.current) {
              skipFormulaBlurRef.current = false;
            } else if (activeCell) {
              commitCell(activeCell.row, activeCell.column, formulaText);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && activeCell) {
              event.preventDefault();
              skipFormulaBlurRef.current = true;
              commitCell(activeCell.row, activeCell.column, formulaText);
              gridRef.current?.setActivePosition({
                idx: activeCell.column + 1,
                rowIdx: activeCell.row,
              });
            } else if (event.key === 'Escape' && activeCell) {
              event.preventDefault();
              skipFormulaBlurRef.current = true;
              cancelDraft();
              setFormulaText(
                displayInput(
                  finalInput(
                    config,
                    committedSubmissionRef.current,
                    sheet.name,
                    cellAddress(activeCell.row, activeCell.column),
                  ),
                ),
              );
              gridRef.current?.setActivePosition({
                idx: activeCell.column + 1,
                rowIdx: activeCell.row,
              });
            }
          }}
        />
      </div>
      {config.template.sheets.length > 1 && (
        <div className="pl-spreadsheet-sheet-tabs" role="tablist" aria-label="Workbook sheets">
          {config.template.sheets.map((candidate, index) => (
            <button
              key={candidate.name}
              type="button"
              className={`btn btn-sm ${index === activeSheetIndex ? 'btn-dark' : 'btn-outline-dark'}`}
              role="tab"
              aria-selected={index === activeSheetIndex}
              tabIndex={index === activeSheetIndex ? 0 : -1}
              onClick={() => {
                setActiveSheetIndex(index);
                setActiveCell(null);
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
        onCellClick={({ column, setActivePosition }) => {
          if (column.key !== '__row') setActivePosition(true);
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
          setActiveCell({ row: sourceRow, column: parsedColumn.column });
          const address = cellAddress(sourceRow, parsedColumn.column);
          setFormulaText(
            displayInput(finalInput(config, committedSubmissionRef.current, sheet.name, address)),
          );
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
      />
      <div id={errorId} className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

onDocumentReady(() => {
  observe('.pl-spreadsheet-root', {
    constructor: HTMLDivElement,
    initialize(element) {
      const hiddenInput = element.parentElement?.querySelector<HTMLInputElement>(
        '.js-pl-spreadsheet-input',
      );
      try {
        if (!hiddenInput || !element.dataset.options) {
          throw new Error('Spreadsheet metadata is missing.');
        }
        const options = JSON.parse(atob(element.dataset.options)) as SpreadsheetOptions;
        const root = createRoot(element);
        root.render(
          <SpreadsheetErrorBoundary>
            <SpreadsheetEditor options={options} hiddenInput={hiddenInput} />
          </SpreadsheetErrorBoundary>,
        );
        return { remove: () => root.unmount() };
      } catch {
        element.innerHTML = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger m-3';
        alert.role = 'alert';
        alert.textContent = 'The spreadsheet could not be loaded. Reload the page and try again.';
        element.append(alert);
      }
    },
  });
});
