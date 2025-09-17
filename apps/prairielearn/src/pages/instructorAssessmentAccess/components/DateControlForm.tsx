import { useEffect, useState } from 'preact/compat';
import { Button, Card, Col, Form, InputGroup, Row } from 'react-bootstrap';
import {
  type Control,
  type UseFormGetFieldState,
  type UseFormTrigger,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

import { TriStateCheckbox } from './TriStateCheckbox.js';
import type { AccessControlFormData } from './types.js';

interface DateControlFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.dateControl' | `overrides.${number}.dateControl`;
  trigger: UseFormTrigger<AccessControlFormData>;
  getFieldState: UseFormGetFieldState<AccessControlFormData>;
  ruleEnabled?: boolean;
}

export function DateControlForm({
  control,
  namePrefix,
  trigger,
  getFieldState,
  ruleEnabled = true,
}: DateControlFormProps) {
  const [showPassword, setShowPassword] = useState(false);

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

  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dueDate`,
  });

  const releaseDate = useWatch({
    control,
    name: `${namePrefix}.releaseDate`,
  });

  const earlyDeadlines = useWatch({
    control,
    name: `${namePrefix}.earlyDeadlines`,
    defaultValue: [],
  });

  const lateDeadlines = useWatch({
    control,
    name: `${namePrefix}.lateDeadlines`,
    defaultValue: [],
  });

  // Re-validate all deadlines when due date changes
  useEffect(() => {
    if (dueDate) {
      // Trigger validation for all early deadline dates
      earlyDeadlineFields.forEach(async (_, index) => {
        await trigger(`${namePrefix}.earlyDeadlines.${index}.date`);
      });
      // Trigger validation for all late deadline dates
      lateDeadlineFields.forEach(async (_, index) => {
        await trigger(`${namePrefix}.lateDeadlines.${index}.date`);
      });
    }
  }, [dueDate, namePrefix, trigger, earlyDeadlineFields, lateDeadlineFields]);

  // Helper function to get field error for early deadline date
  const getEarlyDeadlineError = (index: number) => {
    const fieldState = getFieldState(`${namePrefix}.earlyDeadlines.${index}.date`);
    return fieldState.error?.message;
  };

  // Helper function to get field error for early deadline credit
  const getEarlyDeadlineCreditError = (index: number) => {
    const fieldState = getFieldState(`${namePrefix}.earlyDeadlines.${index}.credit`);
    return fieldState.error?.message;
  };

  // Helper function to get field error for late deadline date
  const getLateDeadlineError = (index: number) => {
    const fieldState = getFieldState(`${namePrefix}.lateDeadlines.${index}.date`);
    return fieldState.error?.message;
  };

  // Helper function to get field error for late deadline credit
  const getLateDeadlineCreditError = (index: number) => {
    const fieldState = getFieldState(`${namePrefix}.lateDeadlines.${index}.credit`);
    return fieldState.error?.message;
  };

  const addEarlyDeadline = () => {
    appendEarlyDeadline({ date: '', credit: 100 });
  };

  const addLateDeadline = () => {
    appendLateDeadline({ date: '', credit: 100 });
  };

  // Helper function to get the active time range for early deadlines
  const getEarlyDeadlineTimeRange = (index: number) => {
    const currentDeadline = earlyDeadlines?.[index];
    if (!currentDeadline?.date) return null;

    const startDate = releaseDate && releaseDateEnabled ? new Date(releaseDate) : null;
    const endDate = new Date(currentDeadline.date);

    if (!startDate) {
      return `Until ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`;
    }

    return `${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()} — ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`;
  };

  // Helper function to get the active time range for late deadlines
  const getLateDeadlineTimeRange = (index: number) => {
    const currentDeadline = lateDeadlines?.[index];
    if (!currentDeadline?.date) return null;

    const startDate = dueDate && dueDateEnabled ? new Date(dueDate) : null;
    const endDate = new Date(currentDeadline.date);

    if (!startDate) {
      return `Until ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`;
    }

    return `${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()} — ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`;
  };

  // Determine the last effective deadline for "After Last Deadline" text
  const getLastDeadlineText = () => {
    // Only consider late deadlines if Late Deadlines is enabled
    if (lateDeadlinesEnabled) {
      // Get all late deadlines that have dates
      const validLateDeadlines = (lateDeadlines || []).filter((deadline) => deadline?.date);

      if (validLateDeadlines.length > 0) {
        // Find the latest late deadline
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const latestLateDeadline = sortedLateDeadlines[0];
        if (latestLateDeadline.date) {
          const date = new Date(latestLateDeadline.date);
          return `This will take effect after ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        }
      }
    }

    // Fall back to due date if Late Deadlines is disabled or no late deadlines exist
    if (dueDate) {
      const date = new Date(dueDate);
      return `This will take effect after ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
    }

    return 'This will take effect after the last deadline';
  };

  return (
    <Card class="mb-4">
      <Card.Header>
        <div class="d-flex align-items-center">
          <TriStateCheckbox
            control={control}
            name={`${namePrefix}.enabled`}
            disabled={!ruleEnabled}
            disabledReason={!ruleEnabled ? 'Enable this access rule first' : undefined}
            class="me-2"
          />
          <span>Date Control</span>
        </div>
      </Card.Header>
      <Card.Body>
        {/* Release Date and Due Date */}
        <Row class="mb-3">
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <TriStateCheckbox
                  control={control}
                  name={`${namePrefix}.releaseDateEnabled`}
                  disabled={!ruleEnabled || !dateControlEnabled}
                  disabledReason={
                    !ruleEnabled
                      ? 'Enable this access rule first'
                      : !dateControlEnabled
                        ? 'Enable Date Control first'
                        : undefined
                  }
                  class="me-2"
                />
                <Form.Label class="mb-0">Release Date</Form.Label>
              </div>
              <Form.Control
                type="datetime-local"
                disabled={!ruleEnabled || !dateControlEnabled || !releaseDateEnabled}
                {...control.register(`${namePrefix}.releaseDate`)}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <TriStateCheckbox
                  control={control}
                  name={`${namePrefix}.dueDateEnabled`}
                  disabled={!ruleEnabled || !dateControlEnabled}
                  disabledReason={
                    !ruleEnabled
                      ? 'Enable this access rule first'
                      : !dateControlEnabled
                        ? 'Enable Date Control first'
                        : undefined
                  }
                  class="me-2"
                />
                <Form.Label class="mb-0">Due Date</Form.Label>
              </div>
              <Form.Control
                type="datetime-local"
                disabled={!ruleEnabled || !dateControlEnabled || !dueDateEnabled}
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
                  <TriStateCheckbox
                    control={control}
                    name={`${namePrefix}.earlyDeadlinesEnabled`}
                    disabled={
                      !ruleEnabled || !dateControlEnabled || !releaseDateEnabled || !releaseDate
                    }
                    disabledReason={
                      !ruleEnabled
                        ? 'Enable this access rule first'
                        : !dateControlEnabled
                          ? 'Enable Date Control first'
                          : !releaseDateEnabled
                            ? 'Enable Release Date first'
                            : !releaseDate
                              ? 'Set a Release Date first'
                              : undefined
                    }
                    class="me-2"
                  />
                  <span>Early Deadlines</span>
                </div>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={
                    !ruleEnabled ||
                    !dateControlEnabled ||
                    !releaseDateEnabled ||
                    !releaseDate ||
                    !earlyDeadlinesEnabled
                  }
                  onClick={addEarlyDeadline}
                >
                  Add Early
                </Button>
              </div>

              {earlyDeadlineFields.map((field, index) => (
                <div key={field.id} class="mb-3">
                  <Row class="mb-1">
                    <Col md={6}>
                      <Form.Control
                        type="datetime-local"
                        placeholder="Deadline Date"
                        disabled={
                          !ruleEnabled ||
                          !dateControlEnabled ||
                          !releaseDateEnabled ||
                          !releaseDate ||
                          !earlyDeadlinesEnabled
                        }
                        {...control.register(`${namePrefix}.earlyDeadlines.${index}.date`, {
                          validate: (value) => {
                            if (!value) return true;

                            // If due date is set, validate against it
                            if (dueDate) {
                              const deadlineDate = new Date(value);
                              const dueDateObj = new Date(dueDate);
                              return (
                                deadlineDate < dueDateObj ||
                                'Early deadline must be before the due date'
                              );
                            }

                            return true;
                          },
                        })}
                        isInvalid={!!getEarlyDeadlineError(index)}
                      />
                    </Col>
                    <Col md={4}>
                      <InputGroup>
                        <Form.Control
                          type="number"
                          placeholder="Credit"
                          min="0"
                          max="200"
                          disabled={
                            !ruleEnabled ||
                            !dateControlEnabled ||
                            !releaseDateEnabled ||
                            !releaseDate ||
                            !earlyDeadlinesEnabled
                          }
                          {...control.register(`${namePrefix}.earlyDeadlines.${index}.credit`, {
                            valueAsNumber: true,
                            validate: (value) => {
                              // Handle both string and number inputs during typing
                              const numValue =
                                typeof value === 'string' ? Number.parseFloat(value) : value;
                              if (
                                numValue == null ||
                                Number.isNaN(numValue) ||
                                (typeof value === 'string' && value === '')
                              ) {
                                return true;
                              }
                              return (
                                numValue > 100 || 'Early deadline credit must be greater than 100%'
                              );
                            },
                          })}
                          isInvalid={!!getEarlyDeadlineCreditError(index)}
                        />
                        <InputGroup.Text>%</InputGroup.Text>
                      </InputGroup>
                    </Col>
                    <Col md={2}>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={
                          !ruleEnabled ||
                          !dateControlEnabled ||
                          !releaseDateEnabled ||
                          !releaseDate ||
                          !earlyDeadlinesEnabled
                        }
                        onClick={() => removeEarlyDeadline(index)}
                      >
                        <i class="bi bi-x" aria-hidden="true" />
                      </Button>
                    </Col>
                  </Row>
                  {(getEarlyDeadlineError(index) || getEarlyDeadlineCreditError(index)) && (
                    <Row>
                      <Col md={10}>
                        <Form.Control.Feedback type="invalid" style={{ display: 'block' }}>
                          {getEarlyDeadlineError(index) || getEarlyDeadlineCreditError(index)}
                        </Form.Control.Feedback>
                      </Col>
                    </Row>
                  )}
                  {getEarlyDeadlineTimeRange(index) && releaseDateEnabled && releaseDate && (
                    <Row>
                      <Col md={10}>
                        <Form.Text class="text-muted">{getEarlyDeadlineTimeRange(index)}</Form.Text>
                      </Col>
                    </Row>
                  )}
                </div>
              ))}
            </div>
          </Col>
          <Col md={6}>
            {/* Late Deadlines */}
            <div class="mb-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center">
                  <TriStateCheckbox
                    control={control}
                    name={`${namePrefix}.lateDeadlinesEnabled`}
                    disabled={!ruleEnabled || !dateControlEnabled || !dueDateEnabled || !dueDate}
                    disabledReason={
                      !ruleEnabled
                        ? 'Enable this access rule first'
                        : !dateControlEnabled
                          ? 'Enable Date Control first'
                          : !dueDateEnabled
                            ? 'Enable Due Date first'
                            : !dueDate
                              ? 'Set a Due Date first'
                              : undefined
                    }
                    class="me-2"
                  />
                  <span>Late Deadlines</span>
                </div>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={
                    !ruleEnabled ||
                    !dateControlEnabled ||
                    !dueDateEnabled ||
                    !dueDate ||
                    !lateDeadlinesEnabled
                  }
                  onClick={addLateDeadline}
                >
                  Add Late
                </Button>
              </div>

              {lateDeadlineFields.map((field, index) => (
                <div key={field.id} class="mb-3">
                  <Row class="mb-1">
                    <Col md={6}>
                      <Form.Control
                        type="datetime-local"
                        placeholder="Deadline Date"
                        disabled={
                          !ruleEnabled ||
                          !dateControlEnabled ||
                          !dueDateEnabled ||
                          !dueDate ||
                          !lateDeadlinesEnabled
                        }
                        {...control.register(`${namePrefix}.lateDeadlines.${index}.date`, {
                          validate: (value) => {
                            if (!value || !dueDate) return true;
                            const deadlineDate = new Date(value);
                            const dueDateObj = new Date(dueDate);
                            return (
                              deadlineDate > dueDateObj ||
                              'Late deadline must be after the due date'
                            );
                          },
                        })}
                        isInvalid={!!getLateDeadlineError(index)}
                      />
                    </Col>
                    <Col md={4}>
                      <InputGroup>
                        <Form.Control
                          type="number"
                          placeholder="Credit"
                          min="0"
                          max="200"
                          disabled={
                            !ruleEnabled ||
                            !dateControlEnabled ||
                            !dueDateEnabled ||
                            !dueDate ||
                            !lateDeadlinesEnabled
                          }
                          {...control.register(`${namePrefix}.lateDeadlines.${index}.credit`, {
                            valueAsNumber: true,
                            validate: (value) => {
                              // Handle both string and number inputs during typing
                              const numValue =
                                typeof value === 'string' ? Number.parseFloat(value) : value;
                              if (
                                numValue == null ||
                                Number.isNaN(numValue) ||
                                (typeof value === 'string' && value === '')
                              ) {
                                return true;
                              }
                              return (
                                numValue < 100 || 'Late deadline credit must be less than 100%'
                              );
                            },
                          })}
                          isInvalid={!!getLateDeadlineCreditError(index)}
                        />
                        <InputGroup.Text>%</InputGroup.Text>
                      </InputGroup>
                    </Col>
                    <Col md={2}>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={
                          !ruleEnabled ||
                          !dateControlEnabled ||
                          !dueDateEnabled ||
                          !dueDate ||
                          !lateDeadlinesEnabled
                        }
                        onClick={() => removeLateDeadline(index)}
                      >
                        <i class="bi bi-x" aria-hidden="true" />
                      </Button>
                    </Col>
                  </Row>
                  {(getLateDeadlineError(index) || getLateDeadlineCreditError(index)) && (
                    <Row>
                      <Col md={10}>
                        <Form.Control.Feedback type="invalid" style={{ display: 'block' }}>
                          {getLateDeadlineError(index) || getLateDeadlineCreditError(index)}
                        </Form.Control.Feedback>
                      </Col>
                    </Row>
                  )}
                  {getLateDeadlineTimeRange(index) && dueDateEnabled && dueDate && (
                    <Row>
                      <Col md={10}>
                        <Form.Text class="text-muted">{getLateDeadlineTimeRange(index)}</Form.Text>
                      </Col>
                    </Row>
                  )}
                </div>
              ))}
            </div>
          </Col>
        </Row>

        {/* After Last Deadline */}
        <Card class="mb-3">
          <Card.Header>
            <div>
              After Last Deadline
              <br />
              <small class="text-muted">{getLastDeadlineText()}</small>
            </div>
          </Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Allow Submissions"
                  disabled={!ruleEnabled || !dateControlEnabled}
                  {...control.register(`${namePrefix}.afterLastDeadline.allowSubmissions`)}
                />
              </Col>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.afterLastDeadline.creditEnabled`}
                      disabled={!ruleEnabled || !dateControlEnabled || !allowSubmissions}
                      disabledReason={
                        !ruleEnabled
                          ? 'Enable this access rule first'
                          : !dateControlEnabled
                            ? 'Enable Date Control first'
                            : !allowSubmissions
                              ? 'Enable Allow Submissions first'
                              : undefined
                      }
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Credit</Form.Label>
                  </div>
                  <InputGroup>
                    <Form.Control
                      type="number"
                      min="0"
                      max="200"
                      disabled={
                        !ruleEnabled ||
                        !dateControlEnabled ||
                        !allowSubmissions ||
                        !afterLastDeadlineCreditEnabled
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
                <TriStateCheckbox
                  control={control}
                  name={`${namePrefix}.durationMinutesEnabled`}
                  disabled={!ruleEnabled || !dateControlEnabled}
                  disabledReason={
                    !ruleEnabled
                      ? 'Enable this access rule first'
                      : !dateControlEnabled
                        ? 'Enable Date Control first'
                        : undefined
                  }
                  class="me-2"
                />
                <Form.Label class="mb-0">Time limit</Form.Label>
              </div>
              <InputGroup>
                <Form.Control
                  type="number"
                  placeholder="Duration in minutes"
                  min="1"
                  disabled={!ruleEnabled || !dateControlEnabled || !durationMinutesEnabled}
                  {...control.register(`${namePrefix}.durationMinutes`, { valueAsNumber: true })}
                />
                <InputGroup.Text>minutes</InputGroup.Text>
              </InputGroup>
              <Form.Text class="text-muted">
                If this is a timed assessment, once students start it, they have this long to finish
                it.
              </Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <div class="d-flex align-items-center mb-2">
                <TriStateCheckbox
                  control={control}
                  name={`${namePrefix}.passwordEnabled`}
                  disabled={!ruleEnabled || !dateControlEnabled}
                  disabledReason={
                    !ruleEnabled
                      ? 'Enable this access rule first'
                      : !dateControlEnabled
                        ? 'Enable Date Control first'
                        : undefined
                  }
                  class="me-2"
                />
                <Form.Label class="mb-0">Password</Form.Label>
              </div>
              <InputGroup>
                <Form.Control
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  disabled={!ruleEnabled || !dateControlEnabled || !passwordEnabled}
                  {...control.register(`${namePrefix}.password`)}
                />
                <Button
                  variant="outline-secondary"
                  disabled={!ruleEnabled || !dateControlEnabled || !passwordEnabled}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <i class={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
                </Button>
              </InputGroup>
            </Form.Group>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
