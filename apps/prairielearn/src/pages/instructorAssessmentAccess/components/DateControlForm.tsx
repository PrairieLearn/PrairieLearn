import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, useFieldArray, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface DateControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.dateControl' | `overrides.${number}.dateControl`;
}

export function DateControlForm({ control, namePrefix }: DateControlFormProps) {
  const {
    fields: earlyDeadlineFields,
    append: appendEarlyDeadline,
    remove: removeEarlyDeadline,
  } = useFieldArray({
    control,
    name: `${namePrefix}.earlyDeadlines`,
  });

  const {
    fields: lateDeadlineFields,
    append: appendLateDeadline,
    remove: removeLateDeadline,
  } = useFieldArray({
    control,
    name: `${namePrefix}.lateDeadlines`,
  });

  const earlyDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.earlyDeadlinesEnabled`,
  });

  const lateDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.lateDeadlinesEnabled`,
  });

  const addEarlyDeadline = () => {
    appendEarlyDeadline({ date: '', credit: 100 });
  };

  const addLateDeadline = () => {
    appendLateDeadline({ date: '', credit: 100 });
  };

  return (
    <Card class="mb-4">
      <Card.Header>
        <Form.Check
          type="checkbox"
          label="Enable Date Control"
          {...control.register(`${namePrefix}.enabled`)}
        />
      </Card.Header>
      <Card.Body>
        {/* Release Date */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <Form.Check
                type="checkbox"
                label="Enable Release Date"
                {...control.register(`${namePrefix}.releaseDateEnabled`)}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Release Date</Form.Label>
              <Form.Control
                type="datetime-local"
                {...control.register(`${namePrefix}.releaseDate`)}
              />
            </Form.Group>
          </Col>
        </Row>

        {/* Due Date */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <Form.Check
                type="checkbox"
                label="Enable Due Date"
                {...control.register(`${namePrefix}.dueDateEnabled`)}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Due Date</Form.Label>
              <Form.Control type="datetime-local" {...control.register(`${namePrefix}.dueDate`)} />
            </Form.Group>
          </Col>
        </Row>

        {/* Early Deadlines */}
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <Form.Check
              type="checkbox"
              label="Enable Early Deadlines"
              {...control.register(`${namePrefix}.earlyDeadlinesEnabled`)}
            />
            <Button
              size="sm"
              variant="outline-primary"
              disabled={!earlyDeadlinesEnabled}
              onClick={addEarlyDeadline}
            >
              Add Early Deadline
            </Button>
          </div>

          {earlyDeadlineFields.map((field, index) => (
            <Row key={field.id} class="mb-2">
              <Col md={5}>
                <Form.Control
                  type="datetime-local"
                  placeholder="Deadline Date"
                  {...control.register(`${namePrefix}.earlyDeadlines.${index}.date`)}
                />
              </Col>
              <Col md={4}>
                <Form.Control
                  type="number"
                  placeholder="Credit %"
                  min="0"
                  max="200"
                  {...control.register(`${namePrefix}.earlyDeadlines.${index}.credit`, {
                    valueAsNumber: true,
                  })}
                />
              </Col>
              <Col md={3}>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => removeEarlyDeadline(index)}
                >
                  Remove
                </Button>
              </Col>
            </Row>
          ))}
        </div>

        {/* Late Deadlines */}
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <Form.Check
              type="checkbox"
              label="Enable Late Deadlines"
              {...control.register(`${namePrefix}.lateDeadlinesEnabled`)}
            />
            <Button
              size="sm"
              variant="outline-primary"
              disabled={!lateDeadlinesEnabled}
              onClick={addLateDeadline}
            >
              Add Late Deadline
            </Button>
          </div>

          {lateDeadlineFields.map((field, index) => (
            <Row key={field.id} class="mb-2">
              <Col md={5}>
                <Form.Control
                  type="datetime-local"
                  placeholder="Deadline Date"
                  {...control.register(`${namePrefix}.lateDeadlines.${index}.date`)}
                />
              </Col>
              <Col md={4}>
                <Form.Control
                  type="number"
                  placeholder="Credit %"
                  min="0"
                  max="200"
                  {...control.register(`${namePrefix}.lateDeadlines.${index}.credit`, {
                    valueAsNumber: true,
                  })}
                />
              </Col>
              <Col md={3}>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => removeLateDeadline(index)}
                >
                  Remove
                </Button>
              </Col>
            </Row>
          ))}
        </div>

        {/* After Last Deadline */}
        <Card class="mb-3">
          <Card.Header>After Last Deadline</Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Allow Submissions"
                  {...control.register(`${namePrefix}.afterLastDeadline.allowSubmissions`)}
                />
              </Col>
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Enable Credit"
                  {...control.register(`${namePrefix}.afterLastDeadline.creditEnabled`)}
                />
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Credit %</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    max="200"
                    {...control.register(`${namePrefix}.afterLastDeadline.credit`, {
                      valueAsNumber: true,
                    })}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Duration and Password */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <Form.Check
                type="checkbox"
                label="Enable Duration Limit"
                {...control.register(`${namePrefix}.durationMinutesEnabled`)}
              />
            </Form.Group>
            <Form.Control
              type="number"
              placeholder="Duration in minutes"
              min="1"
              {...control.register(`${namePrefix}.durationMinutes`, { valueAsNumber: true })}
            />
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Check
                type="checkbox"
                label="Enable Password Protection"
                {...control.register(`${namePrefix}.passwordEnabled`)}
              />
            </Form.Group>
            <Form.Control
              type="password"
              placeholder="Password"
              {...control.register(`${namePrefix}.password`)}
            />
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
