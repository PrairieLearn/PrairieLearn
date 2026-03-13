import { useState } from 'react';

export function roundPoints(points: number): number {
  return Math.round(Number(points) * 100) / 100;
}

export function GradingPointsInput({
  type,
  typeLabel,
  context,
  showInput,
  points,
  maxPoints,
  showPercentage,
  disabled,
  showInputEdit,
  showRubricButton,
  usePercentage,
  onPointsChange,
  onToggleRubricSettings,
}: {
  type: 'manual' | 'auto';
  typeLabel: string;
  context: string;
  showInput: boolean;
  points: number;
  maxPoints: number;
  showPercentage: boolean;
  disabled: boolean;
  showInputEdit: boolean;
  showRubricButton: boolean;
  usePercentage: boolean;
  onPointsChange?: (points: number, source: 'points' | 'percentage') => void;
  onToggleRubricSettings?: () => void;
}) {
  const [editEnabled, setEditEnabled] = useState(false);
  const percentage = maxPoints ? roundPoints((points * 100) / maxPoints) : 0;

  return (
    <div className="mb-3">
      <span className="w-100">
        {!usePercentage && (
          <label htmlFor={`${type}-score-value-input-points-${context}`}>{typeLabel} Points:</label>
        )}
        {showPercentage && usePercentage && (
          <label htmlFor={`${type}-score-value-input-percentage-${context}`}>
            {typeLabel} Score:
          </label>
        )}
        <span className="float-end">
          {!showInput && !editEnabled && (
            <>
              {!usePercentage && (
                <span>
                  <span>{roundPoints(points)}</span> / {maxPoints}
                </span>
              )}
              {showPercentage && usePercentage && <span>{percentage}%</span>}
            </>
          )}
          <div className="btn-group btn-group-sm" role="group">
            {showInputEdit && !editEnabled && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setEditEnabled(true)}
              >
                <i className="fas fa-pencil" />
              </button>
            )}
            {showRubricButton && onToggleRubricSettings && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onToggleRubricSettings}
              >
                <i className="fas fa-list-check" /> Rubric
              </button>
            )}
          </div>
        </span>
      </span>
      {!usePercentage && (showInput || editEnabled) && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={`${type}-score-value-input-points-${context}`}
            className="form-control"
            name={`score_${type}_points`}
            value={roundPoints(points)}
            disabled={disabled}
            required
            onChange={(e) => onPointsChange?.(Number(e.target.value), 'points')}
          />
          <span className="input-group-text">/ {maxPoints}</span>
        </div>
      )}
      {showPercentage && usePercentage && (showInput || editEnabled) && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={`${type}-score-value-input-percentage-${context}`}
            className="form-control"
            name={`score_${type}_percent`}
            value={percentage}
            disabled={disabled}
            required
            onChange={(e) => onPointsChange?.(Number(e.target.value), 'percentage')}
          />
          <span className="input-group-text">%</span>
        </div>
      )}
    </div>
  );
}

export function TotalPointsDisplay({
  totalPoints,
  maxPoints,
  usePercentage,
  disabled,
  showRubricButton,
  onToggleRubricSettings,
}: {
  totalPoints: number;
  maxPoints: number;
  usePercentage: boolean;
  disabled: boolean;
  showRubricButton: boolean;
  onToggleRubricSettings?: () => void;
}) {
  const percentage = maxPoints ? roundPoints((totalPoints * 100) / maxPoints) : 0;
  return (
    <>
      {showRubricButton && !disabled && onToggleRubricSettings && (
        <span className="float-end btn-group btn-group-sm ms-1" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onToggleRubricSettings}
          >
            <i className="fas fa-list-check" /> Rubric
          </button>
        </span>
      )}
      {!usePercentage && (
        <div className="mb-3 w-100">
          Total Points:
          <span className="float-end">
            {roundPoints(totalPoints)} / {maxPoints}
          </span>
        </div>
      )}
      {maxPoints > 0 && usePercentage && (
        <div className="mb-3 w-100">
          Total Score:
          <span className="float-end">{percentage}%</span>
        </div>
      )}
    </>
  );
}
