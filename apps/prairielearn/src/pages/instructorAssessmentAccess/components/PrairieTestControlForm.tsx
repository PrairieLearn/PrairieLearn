import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { get, useFieldArray, useFormContext, useFormState } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface PrairieTestControlFormProps {
  onRemove?: () => void;
}

export function PrairieTestControlForm({ onRemove }: PrairieTestControlFormProps) {
  const { register } = useFormContext<AccessControlFormData>();

  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray({
    name: 'mainRule.prairieTestExams',
  });

  const { errors } = useFormState();

  const getExamUuidError = (index: number): string | undefined => {
    return get(errors, `mainRule.prairieTestExams.${index}.examUuid`)?.message;
  };

  const addExam = () => {
    appendExam({ examUuid: '', readOnly: false });
  };

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <span>PrairieTest</span>
          <br />
          <Form.Text className="text-muted">
            Integrate with PrairieTest exams for access control
          </Form.Text>
        </div>
        {onRemove && (
          <Button size="sm" variant="outline-danger" onClick={onRemove}>
            <i className="bi bi-x-lg me-1" aria-hidden="true" />
            Remove
          </Button>
        )}
      </Card.Header>
      <Card.Body>
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <strong>PrairieTest Exams</strong>
            <Button size="sm" variant="outline-primary" onClick={addExam}>
              <i className="bi bi-plus-circle me-1" aria-hidden="true" />
              Add Exam
            </Button>
          </div>

          {examFields.length === 0 ? (
            <div className="alert alert-info">
              <i className="bi bi-info-circle me-2" aria-hidden="true" />
              No PrairieTest exams configured. Click "Add Exam" to link an exam.
            </div>
          ) : (
            <div>
              {examFields.map((field, index) => (
                <Card key={field.id} className="mb-3">
                  <Card.Body>
                    <Row>
                      <Col md={8}>
                        <Form.Group className="mb-2" controlId={`mainRule-exam-uuid-${index}`}>
                          <Form.Label>Exam UUID</Form.Label>
                          <Form.Control
                            type="text"
                            isInvalid={!!getExamUuidError(index)}
                            aria-invalid={!!getExamUuidError(index)}
                            aria-errormessage={
                              getExamUuidError(index)
                                ? `mainRule-exam-uuid-${index}-error`
                                : undefined
                            }
                            aria-describedby={`mainRule-exam-uuid-${index}-help`}
                            placeholder="Enter PrairieTest exam UUID (e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c)"
                            {...register(`mainRule.prairieTestExams.${index}.examUuid`, {
                              required: 'Exam UUID is required',
                              pattern: {
                                value:
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                                message: 'Invalid UUID format',
                              },
                            })}
                          />
                          {getExamUuidError(index) && (
                            <Form.Text
                              id={`mainRule-exam-uuid-${index}-error`}
                              className="text-danger d-block"
                              role="alert"
                            >
                              {getExamUuidError(index)}
                            </Form.Text>
                          )}
                          <Form.Text id={`mainRule-exam-uuid-${index}-help`} className="text-muted">
                            You can find this UUID in the PrairieTest exam settings
                          </Form.Text>
                        </Form.Group>
                      </Col>
                      <Col md={4} className="d-flex flex-column justify-content-center">
                        <Form.Group className="mb-2">
                          <Form.Check
                            type="checkbox"
                            id={`mainRule-exam-readonly-${index}`}
                            label="Read-only mode"
                            {...register(`mainRule.prairieTestExams.${index}.readOnly`)}
                            aria-describedby={`mainRule-exam-readonly-${index}-help`}
                          />
                          <Form.Text
                            id={`mainRule-exam-readonly-${index}-help`}
                            className="text-muted"
                          >
                            Students can view but not submit answers
                          </Form.Text>
                        </Form.Group>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          className="mt-2"
                          aria-label={`Remove exam ${index + 1}`}
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
        </div>
      </Card.Body>
    </Card>
  );
}
