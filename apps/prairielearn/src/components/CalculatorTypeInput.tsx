import { Button, Form } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import { type CalculatorType, CalculatorTypeSchema } from '../schemas/infoAssessment.js';

const presets = {
  basic: {
    label: 'Basic',
    description: 'Arithmetic, fractions, percentages, and the previous answer.',
  },
  scientific: {
    label: 'Scientific',
    description: 'Basic operations plus powers, roots, logarithms, trigonometry, and constants.',
  },
  advanced: {
    label: 'Advanced',
    description: 'Unrestricted calculator, including alphabet and function panels.',
  },
};

export function CalculatorTypeInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: CalculatorType;
  disabled: boolean;
  onChange: (value: CalculatorType) => void;
}) {
  return (
    <fieldset className="mt-3 ms-4" aria-label="Calculator type">
      {CalculatorTypeSchema.options.map((type) => (
        <div key={type} className="mb-2">
          <div className="d-flex align-items-center gap-2">
            <Form.Check
              type="radio"
              name={id}
              id={`${id}-${type}`}
              label={presets[type].label}
              aria-describedby={`${id}-${type}-help`}
              checked={value === type}
              disabled={disabled}
              onChange={() => onChange(type)}
            />
            {type === 'advanced' && (
              <OverlayTrigger
                trigger="click"
                placement="auto"
                popover={{
                  header: 'Advanced calculator',
                  body: 'Students can evaluate integrals and derivatives and define variables and functions. Choose Basic or Scientific if these capabilities are not appropriate for your assessment.',
                  props: { id: `${id}-advanced-info` },
                }}
                rootClose
              >
                <Button
                  variant="link"
                  size="sm"
                  className="p-0"
                  aria-label="About the Advanced calculator"
                >
                  <i className="bi bi-info-circle" aria-hidden="true" />
                </Button>
              </OverlayTrigger>
            )}
          </div>
          <Form.Text id={`${id}-${type}-help`} className="d-block ms-4 mt-0">
            {presets[type].description}
          </Form.Text>
        </div>
      ))}
    </fieldset>
  );
}
