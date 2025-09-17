import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { useFieldArray } from 'react-hook-form';

interface PrairieTestControlFormProps {
  control: any;
  namePrefix: string;
}

export function PrairieTestControlForm({ control, namePrefix }: PrairieTestControlFormProps) {
  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray({
    control,
    name: `${namePrefix}.exams`,
  });

  const addExam = () => {
    appendExam({ examUuid: '', readOnly: false });
  };

  return (
    <Card class="mb-4">
      <Card.Header>
        <Form.Check
          type="checkbox"
          label="Enable PrairieTest Control"
          {...control.register(`${namePrefix}.enabled`)}
        />
      </Card.Header>
      <Card.Body>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0">PrairieTest Exams</h6>
          <Button
            size="sm"
            variant="outline-primary"
            disabled={!control.watch(`${namePrefix}.enabled`)}
            onClick={addExam}
          >
            Add Exam
          </Button>
        </div>

        {examFields.length === 0 && control.watch(`${namePrefix}.enabled`) && (
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
                      {...control.register(`${namePrefix}.exams.${index}.examUuid`)}
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
                      {...control.register(`${namePrefix}.exams.${index}.readOnly`)}
                    />
                  </Form.Group>
                </Col>
                <Col md={1} class="d-flex align-items-end">
                  <Button
                    size="sm"
                    variant="outline-danger"
                    class="w-100"
                    onClick={() => removeExam(index)}
                  >
                    Remove
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        ))}

        {!control.watch(`${namePrefix}.enabled`) && (
          <div class="text-muted text-center py-3">
            Enable PrairieTest Control to configure exam integrations.
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
