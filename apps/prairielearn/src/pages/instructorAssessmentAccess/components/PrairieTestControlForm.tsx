import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, useFieldArray, useWatch } from 'react-hook-form';

import { TriStateCheckbox } from './TriStateCheckbox.js';
import type { AccessControlFormData } from './types.js';

interface PrairieTestControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule' | `overrides.${number}`;
  ruleEnabled?: boolean;
}

export function PrairieTestControlForm({
  control,
  namePrefix,
  ruleEnabled = true,
}: PrairieTestControlFormProps) {
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

  return (
    <Card class="mb-4">
      <Card.Header>
        <div class="d-flex align-items-center">
          <TriStateCheckbox
            control={control}
            name={`${namePrefix}.prairieTestControl.enabled`}
            class="me-2"
          />
          <span>PrairieTest Integration</span>
        </div>
        <Form.Text class="text-muted">
          Control access and credit to your exam through PrairieTest
        </Form.Text>
      </Card.Header>
      {enabled && (
        <Card.Body>
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
      )}
    </Card>
  );
}
