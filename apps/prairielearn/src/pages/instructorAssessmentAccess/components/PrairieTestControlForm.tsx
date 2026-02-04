import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';

import { type NamePrefix, getFieldName } from './hooks/useTypedFormWatch.js';
import type { AccessControlFormData } from './types.js';

interface PrairieTestControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: NamePrefix;
  setValue: UseFormSetValue<AccessControlFormData>;
}

export function PrairieTestControlForm({
  control,
  namePrefix,
  setValue,
}: PrairieTestControlFormProps) {
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
      setValue(getFieldName(namePrefix, 'prairieTestControl.exams'), []);
    }
    appendExam({ examUuid: '', readOnly: false });
  };

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <div className="d-flex align-items-center">
            <Form.Check
              type="checkbox"
              className="me-2"
              {...control.register(getFieldName(namePrefix, 'prairieTestControl.enabled'), {
                onChange: (e) => {
                  e.stopPropagation();
                  const { checked } = e.currentTarget;
                  // Just toggle enabled state, don't clear other fields
                  // The data remains in the form state for when they re-enable
                  setValue(getFieldName(namePrefix, 'prairieTestControl.enabled'), checked);
                },
              })}
              onClick={(e) => e.stopPropagation()}
            />
            <span>PrairieTest Integration</span>
          </div>
          <Form.Text className="text-muted">
            Integrate with PrairieTest exams for access control
          </Form.Text>
        </div>
      </Card.Header>
      <Card.Body
        style={{
          opacity: prairieTestEnabled ? 1 : 0.5,
          pointerEvents: prairieTestEnabled ? 'auto' : 'none',
        }}
      >
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <strong>PrairieTest Exams</strong>
            <Button size="sm" variant="outline-primary" onClick={addExam}>
              <i className="bi bi-plus-circle me-1" aria-hidden="true" />
              Add Exam
            </Button>
          </div>

          {examFields.length === 0 ? (
            prairieTestEnabled && (
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2" aria-hidden="true" />
                No PrairieTest exams configured. Click "Add Exam" to link an exam.
              </div>
            )
          ) : (
            <div>
              {examFields.map((field, index) => (
                <Card key={field.id} className="mb-3">
                  <Card.Body>
                    <Row>
                      <Col md={8}>
                        <Form.Group className="mb-2">
                          <Form.Label>Exam UUID</Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="Enter PrairieTest exam UUID (e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c)"
                            {...control.register(
                              getFieldName(
                                namePrefix,
                                `prairieTestControl.exams.${index}.examUuid`,
                              ),
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
                          <Form.Text className="text-muted">
                            You can find this UUID in the PrairieTest exam settings
                          </Form.Text>
                        </Form.Group>
                      </Col>
                      <Col md={4} className="d-flex flex-column justify-content-center">
                        <Form.Group className="mb-2">
                          <Form.Check
                            type="checkbox"
                            label="Read-only mode"
                            {...control.register(
                              getFieldName(
                                namePrefix,
                                `prairieTestControl.exams.${index}.readOnly`,
                              ),
                            )}
                          />
                          <Form.Text className="text-muted">
                            Students can view but not submit answers
                          </Form.Text>
                        </Form.Group>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          className="mt-2"
                          onClick={() => removeExam(index)}
                        >
                          <i className="bi bi-trash me-1" aria-hidden="true" />
                          Remove
                        </Button>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              ))}
            </div>
          )}

          {prairieTestEnabled && (
            <div className="alert alert-warning">
              <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
              <strong>Important:</strong> Make sure the exam UUIDs are correct. Invalid UUIDs will
              be ignored during sync. You can find exam UUIDs in your PrairieTest course settings.
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
