import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

export function GradingPoints({
  context,
  disabled,
  editing,
  label,
  maxPoints,
  onEnableEditing,
  onPercentageChange,
  onPointsChange,
  percentageValue,
  pointsValue,
  showEditButton,
  showInput,
  showPercentage,
  type,
  usePercentage,
}: {
  context: string;
  disabled: boolean;
  editing: boolean;
  label: string;
  maxPoints: number;
  onEnableEditing: () => void;
  onPercentageChange: (value: string) => void;
  onPointsChange: (value: string) => void;
  percentageValue: string;
  pointsValue: string;
  showEditButton: boolean;
  showInput: boolean;
  showPercentage: boolean;
  type: 'auto' | 'manual';
  usePercentage: boolean;
}) {
  const inputVisible = showInput || editing;
  const inputId = `${type}-score-${usePercentage ? 'percentage' : 'points'}-${context}`;

  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between">
        <Form.Label className="mb-0" htmlFor={inputId}>
          {label} {usePercentage ? 'score' : 'points'}:
        </Form.Label>
        {!inputVisible && (
          <span>
            {usePercentage ? (
              <>{percentageValue}%</>
            ) : (
              <>
                {pointsValue} / {maxPoints}
              </>
            )}
            {showEditButton && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary ms-2"
                aria-label={`Edit ${label.toLowerCase()} points`}
                onClick={onEnableEditing}
              >
                <i className="bi bi-pencil" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>

      {inputVisible && (
        <InputGroup className="mt-1">
          <Form.Control
            key={`${type}-${usePercentage ? 'percentage' : 'points'}-input`}
            id={inputId}
            type="number"
            step="any"
            disabled={disabled}
            name={usePercentage ? `score_${type}_percent` : `score_${type}_points`}
            value={usePercentage ? percentageValue : pointsValue}
            required
            onChange={(event) =>
              usePercentage
                ? onPercentageChange(event.target.value)
                : onPointsChange(event.target.value)
            }
          />
          <InputGroup.Text>{usePercentage ? '%' : `/ ${maxPoints}`}</InputGroup.Text>
        </InputGroup>
      )}

      {!inputVisible && (
        <input
          key={`${type}-${usePercentage ? 'percentage' : 'points'}-hidden-input`}
          type="number"
          className="d-none"
          tabIndex={-1}
          disabled={disabled}
          name={usePercentage ? `score_${type}_percent` : `score_${type}_points`}
          value={usePercentage ? percentageValue : pointsValue}
          readOnly
        />
      )}

      {showPercentage && (
        <input
          key={`${type}-${usePercentage ? 'points' : 'percentage'}-hidden-input`}
          type="number"
          className="d-none"
          tabIndex={-1}
          disabled={disabled}
          name={usePercentage ? `score_${type}_points` : `score_${type}_percent`}
          value={usePercentage ? pointsValue : percentageValue}
          readOnly
        />
      )}
    </div>
  );
}

export function TotalPoints({
  maxPoints,
  percentageValue,
  pointsValue,
  usePercentage,
}: {
  maxPoints: number;
  percentageValue: string;
  pointsValue: string;
  usePercentage: boolean;
}) {
  return (
    <div className="mb-3 d-flex justify-content-between">
      <span>Total {usePercentage ? 'score' : 'points'}:</span>
      <span>{usePercentage ? `${percentageValue}%` : `${pointsValue} / ${maxPoints}`}</span>
    </div>
  );
}
