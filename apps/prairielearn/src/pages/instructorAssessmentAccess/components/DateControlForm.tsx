import { Button, Card, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { type Control, useFieldArray, useWatch } from 'react-hook-form';

import { TogglePill } from './TogglePill.js';
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

  const releaseDateEnabled = useWatch({
    control,
    name: `${namePrefix}.releaseDateEnabled`,
  });

  const dueDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dueDateEnabled`,
  });

  const durationMinutesEnabled = useWatch({
    control,
    name: `${namePrefix}.durationMinutesEnabled`,
  });

  const passwordEnabled = useWatch({
    control,
    name: `${namePrefix}.passwordEnabled`,
  });

  const afterLastDeadlineCreditEnabled = useWatch({
    control,
    name: `${namePrefix}.afterLastDeadline.creditEnabled`,
  });

  const allowSubmissions = useWatch({
    control,
    name: `${namePrefix}.afterLastDeadline.allowSubmissions`,
  });

  const dateControlEnabled = useWatch({
    control,
    name: `${namePrefix}.enabled`,
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
        <div class="d-flex align-items-center">
          <span class="me-2">Date Control</span>
          <TogglePill control={control} name={`${namePrefix}.enabled`} />
        </div>
      </Card.Header>
      <Card.Body>
        {/* Release Date and Due Date */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <Form.Label class="mb-0 me-2">Release Date</Form.Label>
                <TogglePill
                  control={control}
                  name={`${namePrefix}.releaseDateEnabled`}
                  disabled={!dateControlEnabled}
                  disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                />
              </div>
              <Form.Control
                type="datetime-local"
                disabled={!dateControlEnabled || !releaseDateEnabled}
                {...control.register(`${namePrefix}.releaseDate`)}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <Form.Label class="mb-0 me-2">Due Date</Form.Label>
                <TogglePill
                  control={control}
                  name={`${namePrefix}.dueDateEnabled`}
                  disabled={!dateControlEnabled}
                  disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                />
              </div>
              <Form.Control
                type="datetime-local"
                disabled={!dateControlEnabled || !dueDateEnabled}
                {...control.register(`${namePrefix}.dueDate`)}
              />
            </Form.Group>
          </Col>
        </Row>

        {/* Early and Late Deadlines */}
        <Row class="mb-4">
          <Col md={6}>
            {/* Early Deadlines */}
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center">
                  <span class="me-2">Early Deadlines</span>
                  <TogglePill
                    control={control}
                    name={`${namePrefix}.earlyDeadlinesEnabled`}
                    disabled={!dateControlEnabled}
                    disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={!dateControlEnabled || !earlyDeadlinesEnabled}
                  onClick={addEarlyDeadline}
                >
                  Add Early
                </Button>
              </div>

              {earlyDeadlineFields.map((field, index) => (
                <Row key={field.id} class="mb-2">
                  <Col md={6}>
                    <Form.Control
                      type="datetime-local"
                      placeholder="Deadline Date"
                      disabled={!dateControlEnabled || !earlyDeadlinesEnabled}
                      {...control.register(`${namePrefix}.earlyDeadlines.${index}.date`)}
                    />
                  </Col>
                  <Col md={4}>
                    <InputGroup>
                      <Form.Control
                        type="number"
                        placeholder="Credit"
                        min="0"
                        max="200"
                        disabled={!dateControlEnabled || !earlyDeadlinesEnabled}
                        {...control.register(`${namePrefix}.earlyDeadlines.${index}.credit`, {
                          valueAsNumber: true,
                        })}
                      />
                      <InputGroup.Text>%</InputGroup.Text>
                    </InputGroup>
                  </Col>
                  <Col md={2}>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={!dateControlEnabled || !earlyDeadlinesEnabled}
                      onClick={() => removeEarlyDeadline(index)}
                    >
                      ×
                    </Button>
                  </Col>
                </Row>
              ))}
            </div>
          </Col>
          <Col md={6}>
            {/* Late Deadlines */}
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center">
                  <span class="me-2">Late Deadlines</span>
                  <TogglePill
                    control={control}
                    name={`${namePrefix}.lateDeadlinesEnabled`}
                    disabled={!dateControlEnabled}
                    disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={!dateControlEnabled || !lateDeadlinesEnabled}
                  onClick={addLateDeadline}
                >
                  Add Late
                </Button>
              </div>

              {lateDeadlineFields.map((field, index) => (
                <Row key={field.id} class="mb-2">
                  <Col md={6}>
                    <Form.Control
                      type="datetime-local"
                      placeholder="Deadline Date"
                      disabled={!dateControlEnabled || !lateDeadlinesEnabled}
                      {...control.register(`${namePrefix}.lateDeadlines.${index}.date`)}
                    />
                  </Col>
                  <Col md={4}>
                    <InputGroup>
                      <Form.Control
                        type="number"
                        placeholder="Credit"
                        min="0"
                        max="200"
                        disabled={!dateControlEnabled || !lateDeadlinesEnabled}
                        {...control.register(`${namePrefix}.lateDeadlines.${index}.credit`, {
                          valueAsNumber: true,
                        })}
                      />
                      <InputGroup.Text>%</InputGroup.Text>
                    </InputGroup>
                  </Col>
                  <Col md={2}>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={!dateControlEnabled || !lateDeadlinesEnabled}
                      onClick={() => removeLateDeadline(index)}
                    >
                      ×
                    </Button>
                  </Col>
                </Row>
              ))}
            </div>
          </Col>
        </Row>

        {/* After Last Deadline */}
        <Card class="mb-3">
          <Card.Header>After Last Deadline</Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Allow Submissions"
                  disabled={!dateControlEnabled}
                  {...control.register(`${namePrefix}.afterLastDeadline.allowSubmissions`)}
                />
              </Col>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <Form.Label class="mb-0 me-2">Credit</Form.Label>
                    <TogglePill
                      control={control}
                      name={`${namePrefix}.afterLastDeadline.creditEnabled`}
                      disabled={!dateControlEnabled || !allowSubmissions}
                      disabledReason={
                        !dateControlEnabled
                          ? 'Enable Date Control first'
                          : !allowSubmissions
                            ? 'Enable Allow Submissions first'
                            : undefined
                      }
                    />
                  </div>
                  <InputGroup>
                    <Form.Control
                      type="number"
                      min="0"
                      max="200"
                      disabled={
                        !dateControlEnabled || !allowSubmissions || !afterLastDeadlineCreditEnabled
                      }
                      {...control.register(`${namePrefix}.afterLastDeadline.credit`, {
                        valueAsNumber: true,
                      })}
                    />
                    <InputGroup.Text>%</InputGroup.Text>
                  </InputGroup>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Duration and Password */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <Form.Label class="mb-0 me-2">Duration in minutes</Form.Label>
                <TogglePill
                  control={control}
                  name={`${namePrefix}.durationMinutesEnabled`}
                  disabled={!dateControlEnabled}
                  disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                />
              </div>
              <Form.Control
                type="number"
                placeholder="Duration in minutes"
                min="1"
                disabled={!dateControlEnabled || !durationMinutesEnabled}
                {...control.register(`${namePrefix}.durationMinutes`, { valueAsNumber: true })}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <Form.Label class="mb-0 me-2">Password</Form.Label>
                <TogglePill
                  control={control}
                  name={`${namePrefix}.passwordEnabled`}
                  disabled={!dateControlEnabled}
                  disabledReason={!dateControlEnabled ? 'Enable Date Control first' : undefined}
                />
              </div>
              <Form.Control
                type="password"
                placeholder="Password"
                disabled={!dateControlEnabled || !passwordEnabled}
                {...control.register(`${namePrefix}.password`)}
              />
            </Form.Group>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
