import { OverlayTrigger } from '@prairielearn/ui';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { roundPoints } from './GradingPointsSection.js';

function RubricItemCheckbox({
  item,
  maxPointsForPercentage,
  disabled,
  aiChecked,
  usePercentage,
  checked,
  onToggle,
}: {
  item: RubricData['rubric_items'][0];
  maxPointsForPercentage: number;
  disabled: boolean;
  aiChecked?: boolean;
  usePercentage: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const points = item.rubric_item.points;
  const percentage = maxPointsForPercentage
    ? roundPoints((points * 100) / maxPointsForPercentage)
    : 0;

  return (
    <div>
      <label
        className="w-100"
        style={{
          borderColor: 'rgba(0, 0, 0, 0)',
          borderWidth: '1px',
          borderStyle: 'solid',
          ...(checked
            ? { borderColor: 'rgba(0, 0, 0, 0.125)', backgroundColor: 'var(--light)' }
            : {}),
        }}
      >
        {aiChecked !== undefined && (
          <OverlayTrigger
            placement="top"
            tooltip={{
              body: aiChecked ? 'Selected by AI' : 'Not selected by AI',
              props: { id: `tooltip-ai-checked-${item.rubric_item.id}` },
            }}
          >
            <input
              type="checkbox"
              style={{ marginLeft: '3px', marginRight: '8px' }}
              checked={aiChecked}
              disabled
            />
          </OverlayTrigger>
        )}
        <input
          type="checkbox"
          name="rubric_item_selected_manual"
          className="me-2"
          value={item.rubric_item.id}
          checked={checked}
          disabled={disabled}
          data-key-binding={item.rubric_item.key_binding}
          onChange={() => onToggle(item.rubric_item.id)}
        />
        <span className="badge text-bg-info">{item.rubric_item.key_binding}</span>
        <span className={`float-end text-${points >= 0 ? 'success' : 'danger'}`}>
          <strong>
            {!usePercentage && (
              <span data-testid="rubric-item-points">
                [{(points >= 0 ? '+' : '') + roundPoints(points)}]
              </span>
            )}
            {maxPointsForPercentage > 0 && usePercentage && (
              <span>[{(points >= 0 ? '+' : '') + percentage}%]</span>
            )}
          </strong>
        </span>
        <span>
          <div
            className="d-inline-block"
            data-testid="rubric-item-description"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.description_rendered ?? '' }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-explanation"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.explanation_rendered ?? '' }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-grader-note"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.grader_note_rendered ?? '' }}
          />
        </span>
      </label>
    </div>
  );
}

export function RubricInputSection({
  rubricData,
  disabled,
  aiGradingInfo,
  maxPointsForPercentage,
  usePercentage,
  selectedItems,
  onToggleItem,
  adjustPoints,
  adjustPointsShown,
  onAdjustPointsChange,
  onShowAdjustPoints,
}: {
  rubricData: RubricData;
  disabled: boolean;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  maxPointsForPercentage: number;
  usePercentage: boolean;
  selectedItems: Set<string>;
  onToggleItem: (id: string) => void;
  adjustPoints: number;
  adjustPointsShown: boolean;
  onAdjustPointsChange: (points: number, source: 'points' | 'percentage') => void;
  onShowAdjustPoints: () => void;
}) {
  const aiSelectedIds = aiGradingInfo?.submissionManuallyGraded
    ? new Set(aiGradingInfo.selectedRubricItemIds)
    : null;

  const adjustPercentage = maxPointsForPercentage
    ? roundPoints((adjustPoints * 100) / maxPointsForPercentage)
    : 0;

  return (
    <>
      {aiGradingInfo?.submissionManuallyGraded && (
        <div
          className="d-flex align-items-center gap-2 text-secondary mb-1"
          style={{ paddingLeft: '3px' }}
        >
          <OverlayTrigger
            tooltip={{ body: 'AI grading', props: { id: 'tooltip-ai-grading-icon' } }}
          >
            <div>
              <i className="bi bi-stars" />
            </div>
          </OverlayTrigger>
          <OverlayTrigger
            tooltip={{ body: 'Manual grading', props: { id: 'tooltip-manual-grading-icon' } }}
          >
            <div>
              <i className="bi bi-person-fill" />
            </div>
          </OverlayTrigger>
        </div>
      )}
      {rubricData.rubric_items.map((item) => (
        <RubricItemCheckbox
          key={item.rubric_item.id}
          item={item}
          maxPointsForPercentage={maxPointsForPercentage}
          disabled={disabled}
          aiChecked={aiSelectedIds ? aiSelectedIds.has(item.rubric_item.id) : undefined}
          usePercentage={usePercentage}
          checked={selectedItems.has(item.rubric_item.id)}
          onToggle={onToggleItem}
        />
      ))}
      <div className="d-flex justify-content-end">
        {!adjustPointsShown && !disabled && (
          <button type="button" className="btn btn-sm btn-link" onClick={onShowAdjustPoints}>
            Apply adjustment
          </button>
        )}
        {adjustPointsShown && (
          <div className="w-25">
            <label>
              <span className="small">Adjustment:</span>
              {!usePercentage && (
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={adjustPoints}
                    disabled={disabled}
                    onChange={(e) => onAdjustPointsChange(Number(e.target.value), 'points')}
                  />
                </div>
              )}
              {maxPointsForPercentage > 0 && usePercentage && (
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={adjustPercentage}
                    disabled={disabled}
                    onChange={(e) => onAdjustPointsChange(Number(e.target.value), 'percentage')}
                  />
                  <span className="input-group-text">%</span>
                </div>
              )}
            </label>
          </div>
        )}
      </div>
    </>
  );
}
