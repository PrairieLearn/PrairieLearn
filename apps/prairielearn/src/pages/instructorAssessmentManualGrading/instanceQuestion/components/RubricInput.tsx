import clsx from 'clsx';
import { type RefObject, useId } from 'react';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

import type { RubricData } from '../../../../lib/manualGrading.types.js';

export function RubricInput({
  adjustmentInputRef,
  adjustmentPercentage,
  adjustmentPoints,
  aiSelectedRubricItemIds,
  disabled,
  enableKeyboardShortcuts,
  maxPoints,
  maxRubricPoints,
  onAdjustmentPercentageChange,
  onAdjustmentPointsChange,
  onRubricItemChange,
  onShowAdjustment,
  rubricData,
  selectedRubricItemIds,
  showAdjustment,
  showEditRubricButton,
  usePercentage,
}: {
  adjustmentInputRef: RefObject<HTMLInputElement | null>;
  adjustmentPercentage: string;
  adjustmentPoints: string;
  aiSelectedRubricItemIds: Set<string> | null;
  disabled: boolean;
  enableKeyboardShortcuts: boolean;
  maxPoints: number;
  maxRubricPoints: number;
  onAdjustmentPercentageChange: (value: string) => void;
  onAdjustmentPointsChange: (value: string) => void;
  onRubricItemChange: (id: string, selected: boolean) => void;
  onShowAdjustment: () => void;
  rubricData: RubricData;
  selectedRubricItemIds: Set<string>;
  showAdjustment: boolean;
  showEditRubricButton: boolean;
  usePercentage: boolean;
}) {
  const rubricItemBaseId = useId();

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <div className="d-flex align-items-center gap-2 text-secondary ps-1">
          {aiSelectedRubricItemIds && (
            <>
              <span title="AI grading">
                <i className="bi bi-stars" aria-hidden="true" />
                <span className="visually-hidden">AI grading</span>
              </span>
              <span title="Human grading">
                <i className="bi bi-person-fill" aria-hidden="true" />
                <span className="visually-hidden">Human grading</span>
              </span>
            </>
          )}
        </div>
        {!disabled && showEditRubricButton && (
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-decoration-none"
            onClick={() => {
              // TODO: RubricSettings is a separate React island. Keep this DOM bridge until the
              // page is hydrated under a shared React root.
              const panel = document.getElementById('rubric-setting');
              if (panel && !panel.classList.contains('show')) {
                document.querySelector<HTMLElement>('[data-bs-target="#rubric-setting"]')?.click();
              }
              (document.getElementById('rubric-editor') ?? panel)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }}
          >
            <i className="bi bi-pencil me-1" aria-hidden="true" />
            Edit rubric
          </button>
        )}
      </div>

      {rubricData.rubric_items.map((item) => {
        const id = item.rubric_item.id;
        const selected = selectedRubricItemIds.has(id);
        const inputId = `${rubricItemBaseId}-${id}`;
        const aiSelected = aiSelectedRubricItemIds?.has(id);
        const keyBinding = enableKeyboardShortcuts ? item.rubric_item.key_binding : null;
        const itemPoints = item.rubric_item.points;
        const displayedPoints = usePercentage
          ? Math.round((itemPoints * 10000) / maxRubricPoints) / 100
          : Math.round(itemPoints * 100) / 100;

        return (
          <div key={id}>
            <label
              htmlFor={inputId}
              className={clsx(
                'js-selectable-rubric-item-label w-100 border rounded px-1',
                selected && 'bg-light',
              )}
              style={{ borderColor: selected ? undefined : 'transparent' }}
            >
              {aiSelectedRubricItemIds && (
                <input
                  type="checkbox"
                  className="mx-2"
                  name="rubric_item_selected_ai"
                  value={id}
                  checked={aiSelected}
                  title={aiSelected ? 'Selected by AI' : 'Not selected by AI'}
                  disabled
                  readOnly
                />
              )}
              <input
                id={inputId}
                type="checkbox"
                name="rubric_item_selected_manual"
                className="js-selectable-rubric-item me-2"
                value={id}
                checked={selected}
                disabled={disabled}
                data-key-binding={keyBinding ?? undefined}
                onChange={(event) => onRubricItemChange(id, event.target.checked)}
              />
              {keyBinding && (
                <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent">
                  {keyBinding}
                </kbd>
              )}
              <span className={`float-end text-${itemPoints >= 0 ? 'success' : 'danger'}`}>
                <strong>
                  <span data-testid="rubric-item-points">
                    [{itemPoints >= 0 ? '+' : ''}
                    {displayedPoints}
                    {usePercentage ? '%' : ''}]
                  </span>
                </strong>
              </span>
              <div
                className="d-inline-block"
                data-testid="rubric-item-description"
                // The rendered fields come from the server's Markdown renderer.
                // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
                dangerouslySetInnerHTML={{ __html: item.description_rendered ?? '' }}
              />
              <div
                className="small text-muted"
                data-testid="rubric-item-explanation"
                // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
                dangerouslySetInnerHTML={{ __html: item.explanation_rendered ?? '' }}
              />
              <div
                className="small text-muted"
                data-testid="rubric-item-grader-note"
                // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
                dangerouslySetInnerHTML={{ __html: item.grader_note_rendered ?? '' }}
              />
            </label>
          </div>
        );
      })}

      {(!disabled || showAdjustment) && (
        <div className="d-flex justify-content-end">
          {!showAdjustment ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-link"
                data-key-binding={enableKeyboardShortcuts ? 'a' : undefined}
                onClick={onShowAdjustment}
              >
                Apply adjustment
                {enableKeyboardShortcuts && (
                  <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent ms-2">
                    A
                  </kbd>
                )}
              </button>
              <input
                type="number"
                className="d-none"
                tabIndex={-1}
                name="score_manual_adjust_points"
                value=""
                readOnly
              />
              {maxPoints > 0 && (
                <input
                  type="number"
                  className="d-none"
                  tabIndex={-1}
                  name="score_manual_adjust_percent"
                  value=""
                  readOnly
                />
              )}
            </>
          ) : (
            <Form.Group className="w-25">
              <Form.Label className="small">Adjustment:</Form.Label>
              <InputGroup size="sm">
                <Form.Control
                  key={`adjustment-${usePercentage ? 'percentage' : 'points'}-input`}
                  ref={adjustmentInputRef}
                  type="number"
                  step="any"
                  disabled={disabled}
                  name={
                    usePercentage ? 'score_manual_adjust_percent' : 'score_manual_adjust_points'
                  }
                  value={usePercentage ? adjustmentPercentage : adjustmentPoints}
                  onChange={(event) =>
                    usePercentage
                      ? onAdjustmentPercentageChange(event.target.value)
                      : onAdjustmentPointsChange(event.target.value)
                  }
                />
                {usePercentage && <InputGroup.Text>%</InputGroup.Text>}
              </InputGroup>
              {maxPoints > 0 && (
                <input
                  key={`adjustment-${usePercentage ? 'points' : 'percentage'}-hidden-input`}
                  type="number"
                  className="d-none"
                  tabIndex={-1}
                  disabled={disabled}
                  name={
                    usePercentage ? 'score_manual_adjust_points' : 'score_manual_adjust_percent'
                  }
                  value={usePercentage ? adjustmentPoints : adjustmentPercentage}
                  readOnly
                />
              )}
            </Form.Group>
          )}
        </div>
      )}
    </>
  );
}
