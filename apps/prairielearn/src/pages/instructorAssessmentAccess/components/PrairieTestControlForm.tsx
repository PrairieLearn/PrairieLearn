import { useState } from 'preact/compat';
import { Button, Card, Col, Collapse, Form, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface PrairieTestControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule' | `overrides.${number}`;
  setValue: UseFormSetValue<AccessControlFormData>;
  _ruleEnabled?: boolean;
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
  setValue,
  _ruleEnabled = true,
  showOverrideButton = false,
  onOverride,
  title = 'PrairieTest Integration',
  description = 'Integrate with PrairieTest exams for access control',
  collapsible = false,
  defaultExpanded = true,
}: PrairieTestControlFormProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray({
    control,
    name: `${namePrefix}.prairieTestControl.exams`,
  });

  // Watch exams array
  const exams = useWatch({
    control,
    name: `${namePrefix}.prairieTestControl.exams`,
  });

  // Watch prairieTestControl.enabled state
  const prairieTestEnabled = useWatch({
    control,
    name: `${namePrefix}.prairieTestControl.enabled`,
  });

  const addExam = () => {
    // Initialize exams array if it doesn't exist
    if (exams === undefined) {
      setValue(`${namePrefix}.prairieTestControl.exams` as any, []);
    }
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
      >
        <div>
          <div class="d-flex align-items-center">
            <Form.Check
              type="checkbox"
              class="me-2"
              {...control.register(`${namePrefix}.prairieTestControl.enabled` as any, {
                onChange: (e) => {
                  e.stopPropagation();
                  const checked = (e.target as HTMLInputElement).checked;
                  // Just toggle enabled state, don't clear other fields
                  // The data remains in the form state for when they re-enable
                  setValue(`${namePrefix}.prairieTestControl.enabled` as any, checked);
                },
              })}
              disabled={showOverrideButton}
              onClick={(e) => e.stopPropagation()}
            />
            <span style={{ cursor: collapsible ? 'pointer' : 'default' }} onClick={toggleExpanded}>
              {title}
            </span>
          </div>
          <Form.Text class="text-muted">{description}</Form.Text>
        </div>
        <div class="d-flex align-items-center">
          {showOverrideButton && onOverride && (
            <Button size="sm" variant="outline-primary" class="me-2" onClick={onOverride}>
              Override
            </Button>
          )}
          {collapsible && (
            <i
              class={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}
              aria-hidden="true"
              style={{ cursor: 'pointer' }}
              onClick={toggleExpanded}
            />
          )}
        </div>
      </Card.Header>
      <Collapse in={!collapsible || isExpanded}>
        <Card.Body
          style={{
            opacity: prairieTestEnabled ? 1 : 0.5,
            pointerEvents: prairieTestEnabled ? 'auto' : 'none',
          }}
        >
          <div>
            <div class="d-flex justify-content-between align-items-center mb-3">
              <strong>PrairieTest Exams</strong>
              <Button size="sm" variant="outline-primary" onClick={addExam}>
                <i class="bi bi-plus-circle me-1" aria-hidden="true" />
                Add Exam
              </Button>
            </div>

            {examFields.length === 0 ? (
              <div class="alert alert-info">
                <i class="bi bi-info-circle me-2" aria-hidden="true" />
                No PrairieTest exams configured. Click "Add Exam" to link an exam.
              </div>
            ) : (
              <div>
                {examFields.map((field, index) => (
                  <Card key={field.id} class="mb-3">
                    <Card.Body>
                      <Row>
                        <Col md={8}>
                          <Form.Group class="mb-2">
                            <Form.Label>Exam UUID</Form.Label>
                            <Form.Control
                              type="text"
                              placeholder="Enter PrairieTest exam UUID (e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c)"
                              {...control.register(
                                `${namePrefix}.prairieTestControl.exams.${index}.examUuid` as any,
                                {
                                  required: prairieTestEnabled ? 'Exam UUID is required' : false,
                                  pattern: prairieTestEnabled
                                    ? {
                                        value:
                                          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                                        message: 'Invalid UUID format',
                                      }
                                    : undefined,
                                },
                              )}
                            />
                            <Form.Text class="text-muted">
                              You can find this UUID in the PrairieTest exam settings
                            </Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={4} class="d-flex flex-column justify-content-center">
                          <Form.Group class="mb-2">
                            <Form.Check
                              type="checkbox"
                              label="Read-only mode"
                              {...control.register(
                                `${namePrefix}.prairieTestControl.exams.${index}.readOnly` as any,
                              )}
                            />
                            <Form.Text class="text-muted">
                              Students can view but not submit answers
                            </Form.Text>
                          </Form.Group>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            class="mt-2"
                            onClick={() => removeExam(index)}
                          >
                            <i class="bi bi-trash me-1" aria-hidden="true" />
                            Remove
                          </Button>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            )}

            <div class="alert alert-warning">
              <i class="bi bi-exclamation-triangle me-2" aria-hidden="true" />
              <strong>Important:</strong> Make sure the exam UUIDs are correct. Invalid UUIDs will
              be ignored during sync. You can find exam UUIDs in your PrairieTest course settings.
            </div>
          </div>
        </Card.Body>
      </Collapse>
    </Card>
  );
}
