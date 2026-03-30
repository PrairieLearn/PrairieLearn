import { useState } from 'react';

import { pointsToPercentage, roundPoints } from '../../../lib/gradingMath.js';

export function GradingPointsInput({
  type,
  typeLabel,
  context,
  showInput,
  points,
  scaleMaxPoints,
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
  scaleMaxPoints: number;
  showPercentage: boolean;
  disabled: boolean;
  showInputEdit: boolean;
  showRubricButton: boolean;
  usePercentage: boolean;
  onPointsChange?: (points: number, source: 'points' | 'percentage') => void;
  onToggleRubricSettings?: () => void;
}) {
  const [editEnabled, setEditEnabled] = useState(false);
  const percentage = pointsToPercentage(points, scaleMaxPoints);
  const pointsInputId = `${type}-score-value-input-points-${context}`;
  const percentageInputId = `${type}-score-value-input-percentage-${context}`;
  const showPointsInput = !usePercentage && (showInput || editEnabled);
  const showPercentageInput = showPercentage && usePercentage && (showInput || editEnabled);

  return (
    <div className="mb-3">
      <span className="w-100">
        {!usePercentage && <label htmlFor={pointsInputId}>{typeLabel} Points:</label>}
        {showPercentage && usePercentage && (
          <label htmlFor={percentageInputId}>{typeLabel} Score:</label>
        )}
        <span className="float-end">
          {!showInput && !editEnabled && (
            <>
              {!usePercentage && (
                <span>
                  <span>{roundPoints(points)}</span> / {scaleMaxPoints}
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
      {showPointsInput && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={pointsInputId}
            className="form-control"
            value={roundPoints(points)}
            disabled={disabled}
            required
            onChange={(e) => onPointsChange?.(Number(e.target.value), 'points')}
          />
          <span className="input-group-text">/ {scaleMaxPoints}</span>
        </div>
      )}
      {showPercentageInput && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={percentageInputId}
            className="form-control"
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
  const percentage = pointsToPercentage(totalPoints, maxPoints);
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
