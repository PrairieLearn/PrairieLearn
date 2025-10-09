import { useEffect, useState } from 'preact/compat';
import { Button, Card, Col, Collapse, Form, InputGroup, Row } from 'react-bootstrap';
import {
  type Control,
  type UseFormSetValue,
  type UseFormTrigger,
  useFieldArray,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { FriendlyDate } from '../../../components/FriendlyDate.js';
import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';

import { OverrideElement } from './OverrideElement.js';
import type { AccessControlFormData } from './types.js';

interface DateControlFormProps {
  control: Control<AccessControlFormData>;
  trigger?: UseFormTrigger<AccessControlFormData>;
  courseInstance?: StaffCourseInstanceContext['course_instance'];
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix?: 'mainRule' | `overrides.${number}`;
  _ruleEnabled?: boolean;
  _assessmentType?: 'Exam' | 'Homework';
  _isOverride?: boolean;
  _overrideData?: any;
  showOverrideButton?: boolean;
  onOverride?: () => void;
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function DateControlForm({
  control,
  trigger,
  courseInstance: _courseInstance,
  setValue,
  namePrefix = 'mainRule',
  _ruleEnabled = true,
  _assessmentType = 'Exam',
  _isOverride = false,
  _overrideData,
  showOverrideButton = false,
  onOverride,
  title = 'Date Control',
  description = 'Control access and credit to your exam based on a schedule',
  collapsible = false,
  defaultExpanded = true,
}: DateControlFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { errors: formErrors } = useFormState({ control });

  // Get the user's local browser timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Use useFormState to get reactive error states
  const { errors } = useFormState({ control });

  const {
    fields: earlyDeadlineFields,
    append: appendEarlyDeadline,
    remove: removeEarlyDeadline,
  } = useFieldArray({
    control,
    name: `${namePrefix}.dateControl.earlyDeadlines` as any,
  });

  const {
    fields: lateDeadlineFields,
    append: appendLateDeadline,
    remove: removeLateDeadline,
  } = useFieldArray({
    control,
    name: `${namePrefix}.dateControl.lateDeadlines` as any,
  });

  const earlyDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.earlyDeadlinesEnabled` as any,
  });

  const lateDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlinesEnabled` as any,
  });

  const releaseDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.releaseDateEnabled` as any,
    defaultValue: false,
  });

  const dueDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDateEnabled` as any,
    defaultValue: false,
  });

  const timeLimitEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.timeLimitEnabled` as any,
    defaultValue: false,
  });

  const passwordEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.passwordEnabled` as any,
    defaultValue: false,
  });

  const durationMinutesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutesEnabled` as any,
  });

  const durationMinutes = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutes` as any,
  });

  const afterLastDeadlineCreditEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.creditEnabled` as any,
  });

  const allowSubmissions = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
  });

  // Determine the current radio selection based on existing fields
  const getAfterLastDeadlineMode = () => {
    if (!allowSubmissions) return 'no_submissions';
    if (allowSubmissions && !afterLastDeadlineCreditEnabled) return 'practice_submissions';
    if (allowSubmissions && afterLastDeadlineCreditEnabled) return 'partial_credit';
    return 'no_submissions';
  };

  const afterLastDeadlineMode = getAfterLastDeadlineMode();

  const dateControlEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.enabled` as any,
  });

  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDate` as any,
  });

  const releaseDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.releaseDate` as any,
  });

  const earlyDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.earlyDeadlines` as any,
    defaultValue: [],
  });

  const lateDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlines` as any,
    defaultValue: [],
  });

  // Re-validate all deadlines when due date changes
  useEffect(() => {
    if (dueDate) {
      // Trigger validation for all early deadline dates
      earlyDeadlineFields.forEach(async (_, index) => {
        await trigger?.(`${namePrefix}.dateControl.earlyDeadlines.${index}.date`);
      });
      // Trigger validation for all late deadline dates
      lateDeadlineFields.forEach(async (_, index) => {
        await trigger?.(`${namePrefix}.dateControl.lateDeadlines.${index}.date`);
      });
    }
  }, [dueDate, trigger, earlyDeadlineFields, lateDeadlineFields, namePrefix]);

  // Helper function to get field error for early deadline date
  const getEarlyDeadlineError = (index: number) => {
    return errors.mainRule?.dateControl?.earlyDeadlines?.[index]?.date?.message;
  };

  // Helper function to get field error for early deadline credit
  const getEarlyDeadlineCreditError = (index: number) => {
    return errors.mainRule?.dateControl?.earlyDeadlines?.[index]?.credit?.message;
  };

  // Helper function to get field error for late deadline date
  const getLateDeadlineError = (index: number) => {
    return errors.mainRule?.dateControl?.lateDeadlines?.[index]?.date?.message;
  };

  // Helper function to get field error for late deadline credit
  const getLateDeadlineCreditError = (index: number) => {
    return errors.mainRule?.dateControl?.lateDeadlines?.[index]?.credit?.message;
  };

  const addEarlyDeadline = () => {
    appendEarlyDeadline({ date: '', credit: 101 });
  };

  const addLateDeadline = () => {
    appendLateDeadline({ date: '', credit: 99 });
  };

  // Helper function to get the active time range for early deadlines
  const getEarlyDeadlineTimeRange = (index: number) => {
    const currentDeadline = earlyDeadlines?.[index];
    if (!currentDeadline?.date) return null;

    const endDate = new Date(currentDeadline.date);
    let startDate: Date | null = null;

    if (index === 0) {
      // First early deadline: from release date (or "while accessible" if no release date)
      if (releaseDate && releaseDateEnabled === true) {
        startDate = new Date(releaseDate);
      }
    } else {
      // Subsequent early deadlines: from the previous deadline
      const previousDeadline = earlyDeadlines?.[index - 1];
      if (previousDeadline?.date) {
        startDate = new Date(previousDeadline.date);
      }
    }

    if (!startDate) {
      return (
        <>
          While accessible —{' '}
          <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return (
      <>
        <FriendlyDate date={startDate} timezone={userTimezone} options={{ includeTz: false }} /> —{' '}
        <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
      </>
    );
  };

  // Helper function to get the active time range for late deadlines
  const getLateDeadlineTimeRange = (index: number) => {
    const currentDeadline = lateDeadlines?.[index];
    if (!currentDeadline?.date) return null;

    const endDate = new Date(currentDeadline.date);
    let startDate: Date | null = null;

    if (index === 0) {
      // First late deadline: from due date
      if (dueDate && dueDateEnabled === true) {
        startDate = new Date(dueDate);
      }
    } else {
      // Subsequent late deadlines: from the previous deadline
      const previousDeadline = lateDeadlines?.[index - 1];
      if (previousDeadline?.date) {
        startDate = new Date(previousDeadline.date);
      }
    }

    if (!startDate) {
      return (
        <>
          After due date —{' '}
          <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return (
      <>
        <FriendlyDate date={startDate} timezone={userTimezone} options={{ includeTz: false }} /> —{' '}
        <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
      </>
    );
  };

  // Determine the last effective deadline for "After Last Deadline" text
  const getLastDeadlineText = () => {
    // Only consider late deadlines if Late Deadlines is enabled
    if (lateDeadlinesEnabled === true) {
      // Get all late deadlines that have dates
      const validLateDeadlines = (lateDeadlines || []).filter((deadline: any) => deadline?.date);

      if (validLateDeadlines.length > 0) {
        // Find the latest late deadline
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const latestLateDeadline = sortedLateDeadlines[0];
        if (latestLateDeadline.date) {
          const date = new Date(latestLateDeadline.date);
          return (
            <>
              This will take effect after{' '}
              <FriendlyDate date={date} timezone={userTimezone} options={{ includeTz: false }} />
            </>
          );
        }
      }
    }

    // Fall back to due date if Late Deadlines is disabled or no late deadlines exist
    if (dueDateEnabled === true && dueDate) {
      const date = new Date(dueDate);
      return (
        <>
          This will take effect after{' '}
          <FriendlyDate date={date} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return 'This will take effect after the last deadline';
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
        <div>
          <div class="d-flex align-items-center">
            <Form.Check
              type="checkbox"
              class="me-2"
              {...control.register(`${namePrefix}.dateControl.enabled` as any, {
                validate: (value, formData) => {
                  const prairieTestControlEnabled = formData.mainRule.prairieTestControl?.enabled;
                  const controlEnabled = value || prairieTestControlEnabled;
                  if (!controlEnabled) {
                    return 'Either Date Control or PrairieTest Integration must be enabled';
                  }
                  return true;
                },
                deps: ['mainRule.prairieTestControl.enabled'],
              })}
            />
            <span>{title}</span>
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
            <i class={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden="true" />
          )}
        </div>
      </Card.Header>
      {(formErrors as any)[namePrefix]?.dateControl?.enabled && (
        <Form.Text class="text-danger d-block mt-1 ms-3">
          {(formErrors as any)[namePrefix]?.dateControl?.enabled?.message}
        </Form.Text>
      )}
      {(dateControlEnabled || namePrefix.startsWith('overrides.')) && (
        <Collapse in={!collapsible || isExpanded}>
          <Card.Body>
            <div>
              {/* Release Date and Due Date */}
              <Row class="mb-3">
                <Col md={6}>
                  <OverrideElement
                    isOverridden={releaseDateEnabled !== undefined}
                    showOverrideButton={namePrefix.startsWith('overrides.')}
                    onOverride={() =>
                      setValue(`${namePrefix}.dateControl.releaseDateEnabled` as any, true)
                    }
                    onRemoveOverride={() =>
                      setValue(`${namePrefix}.dateControl.releaseDateEnabled` as any, undefined)
                    }
                  >
                    <Form.Group>
                      <div class="mb-2">
                        <Form.Check
                          type="radio"
                          name="releaseMode"
                          id="release-immediately"
                          label="Released immediately"
                          checked={releaseDateEnabled === false}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(
                                `${namePrefix}.dateControl.releaseDateEnabled` as any,
                                false,
                              );
                            }
                          }}
                        />
                        <Form.Check
                          type="radio"
                          name="releaseMode"
                          id="release-after-date"
                          label="Released after date"
                          checked={releaseDateEnabled === true}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(`${namePrefix}.dateControl.releaseDateEnabled` as any, true);
                            }
                          }}
                        />
                      </div>
                      {releaseDateEnabled && (
                        <Form.Control
                          type="datetime-local"
                          {...control.register(`${namePrefix}.dateControl.releaseDate` as any)}
                        />
                      )}
                    </Form.Group>
                  </OverrideElement>
                </Col>
                <Col md={6}>
                  <OverrideElement
                    isOverridden={dueDateEnabled !== undefined}
                    showOverrideButton={namePrefix.startsWith('overrides.')}
                    onOverride={() =>
                      setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, true)
                    }
                    onRemoveOverride={() =>
                      setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, undefined)
                    }
                  >
                    <Form.Group>
                      <div class="mb-2">
                        <Form.Check
                          type="radio"
                          name="dueMode"
                          id="due-never"
                          label="No due date"
                          checked={dueDateEnabled === false}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, false);
                            }
                          }}
                        />
                        <Form.Check
                          type="radio"
                          name="dueMode"
                          id="due-on-date"
                          label="Due on date"
                          checked={dueDateEnabled === true}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, true);
                            }
                          }}
                        />
                      </div>
                      {dueDateEnabled && (
                        <>
                          <Form.Control
                            type="datetime-local"
                            {...control.register(`${namePrefix}.dateControl.dueDate` as any)}
                          />
                          {dueDate && (
                            <Form.Text class="text-muted">
                              {(() => {
                                const dueDateObj = new Date(dueDate);

                                // Check if there are any early deadlines
                                const validEarlyDeadlines = (earlyDeadlines || []).filter(
                                  (deadline: any) => deadline?.date,
                                );

                                if (validEarlyDeadlines.length > 0) {
                                  // Find the latest early deadline
                                  const sortedEarlyDeadlines = validEarlyDeadlines.sort(
                                    (a: any, b: any) =>
                                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                                  );
                                  const latestEarlyDeadline = sortedEarlyDeadlines[0];
                                  const latestEarlyDate = new Date(latestEarlyDeadline.date);

                                  return (
                                    <>
                                      <FriendlyDate
                                        date={latestEarlyDate}
                                        timezone={userTimezone}
                                        options={{ includeTz: false }}
                                      />{' '}
                                      —{' '}
                                      <FriendlyDate
                                        date={dueDateObj}
                                        timezone={userTimezone}
                                        options={{ includeTz: false }}
                                      />{' '}
                                      (100% credit)
                                    </>
                                  );
                                } else if (releaseDateEnabled === true && releaseDate) {
                                  // No early deadlines, use release date
                                  const releaseDateObj = new Date(releaseDate);
                                  return (
                                    <>
                                      <FriendlyDate
                                        date={releaseDateObj}
                                        timezone={userTimezone}
                                        options={{ includeTz: false }}
                                      />{' '}
                                      —{' '}
                                      <FriendlyDate
                                        date={dueDateObj}
                                        timezone={userTimezone}
                                        options={{ includeTz: false }}
                                      />{' '}
                                      (100% credit)
                                    </>
                                  );
                                } else {
                                  // No early deadlines and no release date
                                  return (
                                    <>
                                      While accessible —{' '}
                                      <FriendlyDate
                                        date={dueDateObj}
                                        timezone={userTimezone}
                                        options={{ includeTz: false }}
                                      />{' '}
                                      (100% credit)
                                    </>
                                  );
                                }
                              })()}
                            </Form.Text>
                          )}
                        </>
                      )}
                    </Form.Group>
                  </OverrideElement>
                </Col>
              </Row>

              {/* Early and Late Deadlines */}
              <Row class="mb-4">
                <Col md={6}>
                  {/* Early Deadlines */}
                  {dueDateEnabled === true && dueDate && (
                    <div class="mb-4">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center">
                          <Form.Check
                            type="checkbox"
                            class="me-2"
                            {...control.register(
                              `${namePrefix}.dateControl.earlyDeadlinesEnabled` as any,
                            )}
                          />
                          <span>Early Deadlines</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={earlyDeadlinesEnabled !== true}
                          onClick={addEarlyDeadline}
                        >
                          Add Early
                        </Button>
                      </div>

                      {earlyDeadlinesEnabled === true &&
                        earlyDeadlineFields.map((field, index) => (
                          <div key={field.id} class="mb-3">
                            <Row class="mb-1">
                              <Col md={6}>
                                <Form.Control
                                  type="datetime-local"
                                  placeholder="Deadline Date"
                                  disabled={earlyDeadlinesEnabled !== true}
                                  {...control.register(
                                    `mainRule.dateControl.earlyDeadlines.${index}.date`,
                                    {
                                      deps: [
                                        'mainRule.dateControl.dueDate',
                                        ...earlyDeadlineFields.map(
                                          (_, i) =>
                                            `mainRule.dateControl.earlyDeadlines.${i}.date` as const,
                                        ),
                                      ],
                                      validate: (value, formValues) => {
                                        if (!value) return true;

                                        const deadlineDate = new Date(value);
                                        const dueDate = formValues.mainRule?.dateControl?.dueDate;

                                        // If due date is set, validate against it
                                        if (dueDate) {
                                          const dueDateObj = new Date(dueDate);
                                          if (deadlineDate >= dueDateObj) {
                                            return 'Early deadline must be before the due date';
                                          }
                                        }

                                        // Check chronological order with other early deadlines
                                        const earlyDeadlines =
                                          formValues.mainRule?.dateControl?.earlyDeadlines || [];
                                        for (let i = 0; i < earlyDeadlines.length; i++) {
                                          if (i !== index && earlyDeadlines[i]?.date) {
                                            const otherDate = new Date(earlyDeadlines[i].date);

                                            // If this deadline is at a later position but has an earlier date
                                            if (index > i && deadlineDate < otherDate) {
                                              return 'Early deadlines must be in chronological order';
                                            }
                                          }
                                        }

                                        return true;
                                      },
                                    },
                                  )}
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
                                    disabled={earlyDeadlinesEnabled !== true}
                                    {...control.register(
                                      `mainRule.dateControl.earlyDeadlines.${index}.credit`,
                                      {
                                        valueAsNumber: true,
                                        deps: earlyDeadlineFields.map(
                                          (_, i) =>
                                            `mainRule.dateControl.earlyDeadlines.${i}.credit` as const,
                                        ),
                                        validate: (value, formValues) => {
                                          if (value == null || Number.isNaN(value)) {
                                            return true;
                                          }

                                          // Check if credit is greater than 100%
                                          if (value <= 100) {
                                            return 'Early deadline credit must be greater than 100%';
                                          }

                                          // Check if credit decreases over time
                                          const currentDeadlines =
                                            formValues.mainRule?.dateControl?.earlyDeadlines || [];
                                          for (let i = 0; i < currentDeadlines.length; i++) {
                                            if (i !== index) {
                                              const otherDeadline = currentDeadlines[i];
                                              const currentDeadline = currentDeadlines[index];

                                              if (
                                                otherDeadline?.credit &&
                                                otherDeadline?.date &&
                                                currentDeadline?.date
                                              ) {
                                                const otherDateObj = new Date(otherDeadline.date);
                                                const currentDateObj = new Date(
                                                  currentDeadline.date,
                                                );

                                                // If this deadline is later than the other one, it should have less credit
                                                if (
                                                  currentDateObj > otherDateObj &&
                                                  value >= otherDeadline.credit
                                                ) {
                                                  return `Credit must be less than ${otherDeadline.credit}%`;
                                                }
                                              }
                                            }
                                          }

                                          return true;
                                        },
                                      },
                                    )}
                                    isInvalid={!!getEarlyDeadlineCreditError(index)}
                                  />
                                  <InputGroup.Text>%</InputGroup.Text>
                                </InputGroup>
                              </Col>
                              <Col md={2}>
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  disabled={earlyDeadlinesEnabled !== true}
                                  onClick={() => removeEarlyDeadline(index)}
                                >
                                  <i class="bi bi-x" aria-hidden="true" />
                                </Button>
                              </Col>
                            </Row>
                            {(getEarlyDeadlineError(index) ||
                              getEarlyDeadlineCreditError(index)) && (
                              <Row>
                                <Col md={10}>
                                  <Form.Control.Feedback
                                    type="invalid"
                                    style={{ display: 'block' }}
                                  >
                                    {getEarlyDeadlineError(index) ||
                                      getEarlyDeadlineCreditError(index)}
                                  </Form.Control.Feedback>
                                </Col>
                              </Row>
                            )}
                            {getEarlyDeadlineTimeRange(index) && (
                              <Row>
                                <Col md={10}>
                                  <Form.Text class="text-muted">
                                    {getEarlyDeadlineTimeRange(index)}
                                  </Form.Text>
                                </Col>
                              </Row>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </Col>
                <Col md={6}>
                  {/* Late Deadlines */}
                  {dueDateEnabled === true && dueDate && (
                    <div class="mb-4">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center">
                          <Form.Check
                            type="checkbox"
                            class="me-2"
                            {...control.register('mainRule.dateControl.lateDeadlinesEnabled')}
                          />
                          <span>Late Deadlines</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={lateDeadlinesEnabled !== true}
                          onClick={addLateDeadline}
                        >
                          Add Late
                        </Button>
                      </div>

                      {lateDeadlinesEnabled === true &&
                        lateDeadlineFields.map((field, index) => (
                          <div key={field.id} class="mb-3">
                            <Row class="mb-1">
                              <Col md={6}>
                                <Form.Control
                                  type="datetime-local"
                                  placeholder="Deadline Date"
                                  disabled={lateDeadlinesEnabled !== true}
                                  {...control.register(
                                    `mainRule.dateControl.lateDeadlines.${index}.date`,
                                    {
                                      deps: [
                                        'mainRule.dateControl.dueDate',
                                        ...lateDeadlineFields.map(
                                          (_, i) =>
                                            `mainRule.dateControl.lateDeadlines.${i}.date` as const,
                                        ),
                                      ],
                                      validate: (value, formValues) => {
                                        if (!value) return true;

                                        const deadlineDate = new Date(value);
                                        const dueDate = formValues.mainRule?.dateControl?.dueDate;

                                        // If due date is set, validate against it
                                        if (dueDate) {
                                          const dueDateObj = new Date(dueDate);
                                          if (deadlineDate <= dueDateObj) {
                                            return 'Late deadline must be after the due date';
                                          }
                                        }

                                        // Check chronological order with other late deadlines
                                        const lateDeadlines =
                                          formValues.mainRule?.dateControl?.lateDeadlines || [];
                                        for (let i = 0; i < lateDeadlines.length; i++) {
                                          if (i !== index && lateDeadlines[i]?.date) {
                                            const otherDate = new Date(lateDeadlines[i].date);

                                            // If this deadline is at an earlier position but has a later date
                                            if (index > i && deadlineDate < otherDate) {
                                              return 'Late deadlines must be in chronological order';
                                            }
                                          }
                                        }

                                        return true;
                                      },
                                    },
                                  )}
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
                                    disabled={lateDeadlinesEnabled !== true}
                                    {...control.register(
                                      `mainRule.dateControl.lateDeadlines.${index}.credit`,
                                      {
                                        valueAsNumber: true,
                                        deps: lateDeadlineFields.map(
                                          (_, i) =>
                                            `mainRule.dateControl.lateDeadlines.${i}.credit` as const,
                                        ),
                                        validate: (value, formValues) => {
                                          if (value == null || Number.isNaN(value)) {
                                            return true;
                                          }

                                          // Check if credit is less than 100%
                                          if (value >= 100) {
                                            return 'Late deadline credit must be less than 100%';
                                          }

                                          // Check if credit decreases over time
                                          const currentDeadlines =
                                            formValues.mainRule?.dateControl?.lateDeadlines || [];
                                          for (let i = 0; i < currentDeadlines.length; i++) {
                                            if (i !== index) {
                                              const otherDeadline = currentDeadlines[i];
                                              const currentDeadline = currentDeadlines[index];

                                              if (
                                                otherDeadline?.credit &&
                                                otherDeadline?.date &&
                                                currentDeadline?.date
                                              ) {
                                                const otherDateObj = new Date(otherDeadline.date);
                                                const currentDateObj = new Date(
                                                  currentDeadline.date,
                                                );

                                                // If this deadline is later than the other one, it should have less credit
                                                if (
                                                  currentDateObj > otherDateObj &&
                                                  value >= otherDeadline.credit
                                                ) {
                                                  return `Credit must be less than ${otherDeadline.credit}%`;
                                                }
                                              }
                                            }
                                          }

                                          return true;
                                        },
                                      },
                                    )}
                                    isInvalid={!!getLateDeadlineCreditError(index)}
                                  />
                                  <InputGroup.Text>%</InputGroup.Text>
                                </InputGroup>
                              </Col>
                              <Col md={2}>
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  disabled={lateDeadlinesEnabled !== true}
                                  onClick={() => removeLateDeadline(index)}
                                >
                                  <i class="bi bi-x" aria-hidden="true" />
                                </Button>
                              </Col>
                            </Row>
                            {(getLateDeadlineError(index) || getLateDeadlineCreditError(index)) && (
                              <Row>
                                <Col md={10}>
                                  <Form.Control.Feedback
                                    type="invalid"
                                    style={{ display: 'block' }}
                                  >
                                    {getLateDeadlineError(index) ||
                                      getLateDeadlineCreditError(index)}
                                  </Form.Control.Feedback>
                                </Col>
                              </Row>
                            )}
                            {getLateDeadlineTimeRange(index) &&
                              dueDateEnabled === true &&
                              dueDate && (
                                <Row>
                                  <Col md={10}>
                                    <Form.Text class="text-muted">
                                      {getLateDeadlineTimeRange(index)}
                                    </Form.Text>
                                  </Col>
                                </Row>
                              )}
                          </div>
                        ))}
                    </div>
                  )}
                </Col>
              </Row>

              {/* After Last Deadline */}
              {dueDateEnabled === true && dueDate && (
                <Card class="mb-3">
                  <Card.Header>
                    <div>
                      After Last Deadline
                      <br />
                      <small class="text-muted">{getLastDeadlineText()}</small>
                    </div>
                  </Card.Header>
                  <Card.Body>
                    <Form.Group>
                      <div class="mb-2">
                        <Form.Check
                          type="radio"
                          name="afterLastDeadlineMode"
                          id="after-deadline-no-submissions"
                          label="No submissions allowed"
                          checked={afterLastDeadlineMode === 'no_submissions'}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.allowSubmissions',
                                false,
                              );
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.creditEnabled',
                                false,
                              );
                              setValue('mainRule.dateControl.afterLastDeadline.credit', 0);
                            }
                          }}
                        />
                        <Form.Check
                          type="radio"
                          name="afterLastDeadlineMode"
                          id="after-deadline-practice-submissions"
                          label="Allow practice submissions"
                          checked={afterLastDeadlineMode === 'practice_submissions'}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.allowSubmissions',
                                true,
                              );
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.creditEnabled',
                                false,
                              );
                              setValue('mainRule.dateControl.afterLastDeadline.credit', 0);
                            }
                          }}
                        />
                        <Form.Text class="text-muted ms-4">
                          No credit is given for practice submissions
                        </Form.Text>
                        <Form.Check
                          type="radio"
                          name="afterLastDeadlineMode"
                          id="after-deadline-partial-credit"
                          label="Allow submissions for partial credit"
                          checked={afterLastDeadlineMode === 'partial_credit'}
                          onChange={(e) => {
                            if ((e.target as HTMLInputElement).checked) {
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.allowSubmissions',
                                true,
                              );
                              setValue(
                                'mainRule.dateControl.afterLastDeadline.creditEnabled',
                                true,
                              );
                            }
                          }}
                        />
                      </div>

                      {afterLastDeadlineMode === 'partial_credit' && (
                        <div class="ms-4">
                          <InputGroup>
                            <Form.Control
                              type="number"
                              min="0"
                              max="200"
                              placeholder="Credit percentage"
                              {...control.register(
                                'mainRule.dateControl.afterLastDeadline.credit',
                                {
                                  valueAsNumber: true,
                                },
                              )}
                            />
                            <InputGroup.Text>%</InputGroup.Text>
                          </InputGroup>
                          <Form.Text class="text-muted">
                            Students will receive this percentage of credit for submissions after
                            the deadline
                          </Form.Text>
                        </div>
                      )}
                    </Form.Group>
                  </Card.Body>
                </Card>
              )}

              {/* Duration and Password */}
              <Row class="mb-3">
                <Col md={6}>
                  <OverrideElement
                    isOverridden={timeLimitEnabled !== undefined}
                    showOverrideButton={namePrefix.startsWith('overrides.')}
                    onOverride={() =>
                      setValue(`${namePrefix}.dateControl.timeLimitEnabled` as any, true)
                    }
                    onRemoveOverride={() =>
                      setValue(`${namePrefix}.dateControl.timeLimitEnabled` as any, undefined)
                    }
                  >
                    <Form.Group>
                      <div class="d-flex align-items-center mb-2">
                        <Form.Check
                          type="checkbox"
                          class="me-2"
                          {...control.register('mainRule.dateControl.durationMinutesEnabled')}
                        />
                        <Form.Label class="mb-0">Time limit</Form.Label>
                      </div>
                      {durationMinutesEnabled === true && (
                        <InputGroup>
                          <Form.Control
                            type="number"
                            placeholder="Duration in minutes"
                            min="1"
                            {...control.register('mainRule.dateControl.durationMinutes', {
                              valueAsNumber: true,
                            })}
                          />
                          <InputGroup.Text>minutes</InputGroup.Text>
                        </InputGroup>
                      )}
                      <Form.Text class="text-muted">
                        {durationMinutesEnabled === true
                          ? `Students will have ${durationMinutes} minutes to complete the assessment.`
                          : 'Add a time limit to the assessment.'}
                      </Form.Text>
                    </Form.Group>
                  </OverrideElement>
                </Col>
                <Col md={6}>
                  <OverrideElement
                    isOverridden={passwordEnabled !== undefined}
                    showOverrideButton={namePrefix.startsWith('overrides.')}
                    onOverride={() =>
                      setValue(`${namePrefix}.dateControl.passwordEnabled` as any, true)
                    }
                    onRemoveOverride={() =>
                      setValue(`${namePrefix}.dateControl.passwordEnabled` as any, undefined)
                    }
                  >
                    <Form.Group>
                      <div class="d-flex align-items-center mb-2">
                        <Form.Check
                          type="checkbox"
                          class="me-2"
                          {...control.register('mainRule.dateControl.passwordEnabled')}
                        />
                        <Form.Label class="mb-0">Password</Form.Label>
                      </div>
                      {passwordEnabled === true && (
                        <InputGroup>
                          <Form.Control
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            {...control.register('mainRule.dateControl.password')}
                          />
                          <Button
                            variant="outline-secondary"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            <i
                              class={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}
                              aria-hidden="true"
                            />
                          </Button>
                        </InputGroup>
                      )}
                      <Form.Text class="text-muted">
                        {passwordEnabled === true
                          ? 'This password will be required to start the assessment.'
                          : 'Require a password in order to start the assessment.'}
                      </Form.Text>
                    </Form.Group>
                  </OverrideElement>
                </Col>
              </Row>
            </div>
          </Card.Body>
        </Collapse>
      )}
    </Card>
  );
}
