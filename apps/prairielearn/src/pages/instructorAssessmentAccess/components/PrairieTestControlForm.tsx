import { useState } from 'preact/compat';
import { Button, Card, Col, Collapse, Form, Row } from 'react-bootstrap';
import { type Control, useFieldArray, useFormState, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface PrairieTestControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule' | `overrides.${number}`;
  ruleEnabled?: boolean;
  showOverrideButton?: boolean;
  onOverride?: () => void;
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function PrairieTestControlForm({
  control,
  namePrefix,
  ruleEnabled = true,
  showOverrideButton = false,
  onOverride,
  title = 'PrairieTest Integration',
  description = 'Integrate with PrairieTest exams for access control',
  collapsible = false,
  defaultExpanded = true,
}: PrairieTestControlFormProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { errors: formErrors } = useFormState({ control });
  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray({
    control,
    name: `${namePrefix}.prairieTestControl.exams`,
  });

  const enabled = useWatch({
    control,
    name: `${namePrefix}.prairieTestControl.enabled`,
  });

  const addExam = () => {
    appendExam({ examUuid: '', readOnly: false });
  };

  const getCardStyle = () => {
    return showOverrideButton ? { border: '2px dashed #dee2e6', borderColor: '#dee2e6' } : {};
  };

  const toggleExpanded = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Card class="mb-4" style={getCardStyle()}>
      <Card.Header
        class="d-flex justify-content-between align-items-center"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        onClick={toggleExpanded}
      >
        <div class="d-flex align-items-center">
          <Form.Check
            type="checkbox"
            class="me-2"
            disabled={showOverrideButton}
            {...control.register(`${namePrefix}.prairieTestControl.enabled`, {
              validate: (value, formData) => {
                const dateControlEnabled = formData.mainRule.dateControl?.enabled;
                const controlEnabled = value || dateControlEnabled;
                if (!controlEnabled) {
                  return 'Either Date Control or PrairieTest Integration must be enabled';
                }
                return true;
              },
              deps: ['mainRule.dateControl.enabled'],
            })}
          />
          <span>{title}</span>
        </div>
        <div class="d-flex align-items-center">
          {showOverrideButton && onOverride && (
            <Button size="sm" variant="outline-primary" onClick={onOverride} class="me-2">
              Override
            </Button>
          )}
          {collapsible && (
            <i class={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden="true" />
          )}
        </div>
      </Card.Header>
      <Form.Text class="text-muted ms-3">{description}</Form.Text>
      {(formErrors as any)[namePrefix]?.prairieTestControl?.enabled && (
        <Form.Text class="text-danger d-block mt-1 ms-3">
          {(formErrors as any)[namePrefix].prairieTestControl.enabled.message}
        </Form.Text>
      )}
      {enabled && (
        <Collapse in={!collapsible || isExpanded}>
          <Card.Body
            style={{
              opacity: showOverrideButton ? 0.5 : 1,
              pointerEvents: showOverrideButton ? 'none' : 'auto',
            }}
          >
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h6 class="mb-0">PrairieTest Exams</h6>
              <Button size="sm" variant="outline-primary" onClick={addExam}>
                Add Exam
              </Button>
            </div>

            {examFields.length === 0 && (
              <div class="text-muted text-center py-3">
                No exams configured. Click "Add Exam" to get started.
              </div>
            )}

            {examFields.map((field, index) => (
              <Card key={field.id} class="mb-3">
                <Card.Body>
                  <Row>
                    <Col md={8}>
                      <Form.Group>
                        <Form.Label>Exam UUID</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Enter PrairieTest exam UUID (e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c)"
                          {...control.register(
                            `${namePrefix}.prairieTestControl.exams.${index}.examUuid`,
                          )}
                        />
                        <Form.Text class="text-muted">
                          The UUID of the PrairieTest exam to integrate with this assessment.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Options</Form.Label>
                        <Form.Check
                          type="checkbox"
                          label="Read Only"
                          {...control.register(
                            `${namePrefix}.prairieTestControl.exams.${index}.readOnly`,
                          )}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={1} class="d-flex align-items-end">
                      <Button
                        size="sm"
                        variant="outline-danger"
                        class="w-100"
                        title="Remove exam"
                        onClick={() => removeExam(index)}
                      >
                        ✕
                      </Button>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            ))}
          </Card.Body>
        </Collapse>
      )}
    </Card>
  );
}
