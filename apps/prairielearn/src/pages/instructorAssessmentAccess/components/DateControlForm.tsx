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
  const [savedData, setSavedData] = useState<any>(null); // Store data when disabling

  // Track whether early/late deadlines are active (separate from whether they have data)
  const [earlyDeadlinesActive, setEarlyDeadlinesActive] = useState(true);
  const [lateDeadlinesActive, setLateDeadlinesActive] = useState(true);

  // const { errors: formErrors } = useFormState({ control });

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

  // Watch actual field values instead of *Enabled fields
  const releaseDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.releaseDate` as any,
  });

  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDate` as any,
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

  const durationMinutes = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutes` as any,
  });

  const password = useWatch({
    control,
    name: `${namePrefix}.dateControl.password` as any,
  });

  const afterLastDeadlineCredit = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.credit` as any,
  });

  const allowSubmissions = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
  });

  // Watch dateControl enabled state
  const dateControlEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.enabled` as any,
  });

  // Derive "enabled" states from field presence (override pattern)
  const releaseDateEnabled = releaseDate !== undefined;
  const dueDateEnabled = dueDate !== undefined;

  // For early/late deadlines, they're "enabled" if they have data AND are active
  const earlyDeadlinesEnabled =
    earlyDeadlines !== undefined &&
    earlyDeadlines !== null &&
    earlyDeadlines.length > 0 &&
    earlyDeadlinesActive;
  const lateDeadlinesEnabled =
    lateDeadlines !== undefined &&
    lateDeadlines !== null &&
    lateDeadlines.length > 0 &&
    lateDeadlinesActive;

  // Check if deadlines have data (for rendering purposes)
  const hasEarlyDeadlinesData =
    earlyDeadlines !== undefined && earlyDeadlines !== null && earlyDeadlines.length > 0;
  const hasLateDeadlinesData =
    lateDeadlines !== undefined && lateDeadlines !== null && lateDeadlines.length > 0;

  const durationMinutesEnabled = durationMinutes !== undefined;
  const passwordEnabled = password !== undefined;
  const afterLastDeadlineCreditEnabled = afterLastDeadlineCredit !== undefined;

  // Initialize active states based on whether data exists
  useEffect(() => {
    setEarlyDeadlinesActive(hasEarlyDeadlinesData);
  }, [hasEarlyDeadlinesData]);

  useEffect(() => {
    setLateDeadlinesActive(hasLateDeadlinesData);
  }, [hasLateDeadlinesData]);

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
    // Initialize earlyDeadlines if it doesn't exist
    if (earlyDeadlines === undefined) {
      setValue(`${namePrefix}.dateControl.earlyDeadlines` as any, []);
    }
    appendEarlyDeadline({ date: '', credit: 101 });
  };

  const addLateDeadline = () => {
    // Initialize lateDeadlines if it doesn't exist
    if (lateDeadlines === undefined) {
      setValue(`${namePrefix}.dateControl.lateDeadlines` as any, []);
    }
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
      if (releaseDate && releaseDateEnabled) {
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
          While accessible –{' '}
          <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return (
      <>
        <FriendlyDate date={startDate} timezone={userTimezone} options={{ includeTz: false }} /> –{' '}
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
      if (dueDate && dueDateEnabled) {
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
          After due date –{' '}
          <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return (
      <>
        <FriendlyDate date={startDate} timezone={userTimezone} options={{ includeTz: false }} /> –{' '}
        <FriendlyDate date={endDate} timezone={userTimezone} options={{ includeTz: false }} />
      </>
    );
  };

  // Determine the last effective deadline for "After Last Deadline" text
  const getLastDeadlineText = () => {
    // Only consider late deadlines if they exist
    if (lateDeadlinesEnabled) {
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

    // Fall back to due date if no late deadlines exist
    if (dueDateEnabled && dueDate) {
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

  // Determine the current radio selection based on existing fields
  const getAfterLastDeadlineMode = () => {
    if (!allowSubmissions) return 'no_submissions';
    if (allowSubmissions && !afterLastDeadlineCreditEnabled) return 'practice_submissions';
    if (allowSubmissions && afterLastDeadlineCreditEnabled) return 'partial_credit';
    return 'no_submissions';
  };

  const afterLastDeadlineMode = getAfterLastDeadlineMode();

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
              {...control.register(`${namePrefix}.dateControl.enabled` as any, {
                onChange: (e) => {
                  const checked = (e.target as HTMLInputElement).checked;

                  if (!checked) {
                    // When disabling, clear all other fields - only keep enabled: false
                    setValue(`${namePrefix}.dateControl` as any, { enabled: false });
                  } else {
                    // When enabling, restore with enabled: true and empty/default values
                    setValue(`${namePrefix}.dateControl` as any, {
                      enabled: true,
                      releaseDate: null,
                      dueDate: null,
                      earlyDeadlines: null,
                      lateDeadlines: null,
                      afterLastDeadline: {
                        allowSubmissions: false,
                      },
                      durationMinutes: null,
                      password: null,
                    });
                  }
                },
              })}
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
        <Card.Body>
          <div>
            {/* Release Date and Due Date */}
            <Row class="mb-3">
              <Col md={6}>
                <OverrideElement
                  isOverridden={releaseDate !== undefined}
                  showOverrideButton={namePrefix.startsWith('overrides.')}
                  onOverride={() => setValue(`${namePrefix}.dateControl.releaseDate` as any, '')}
                  onRemoveOverride={() =>
                    setValue(`${namePrefix}.dateControl.releaseDate` as any, undefined)
                  }
                >
                  <Form.Group>
                    <div class="mb-2">
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-releaseMode`}
                        id={`${namePrefix}-release-immediately`}
                        label="Released immediately"
                        checked={!releaseDateEnabled}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.releaseDate` as any, null);
                          }
                        }}
                      />
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-releaseMode`}
                        id={`${namePrefix}-release-after-date`}
                        label="Released after date"
                        checked={releaseDateEnabled && releaseDate !== null}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.releaseDate` as any, '');
                          }
                        }}
                      />
                    </div>
                    {releaseDateEnabled && releaseDate !== null && (
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
                  isOverridden={dueDate !== undefined}
                  showOverrideButton={namePrefix.startsWith('overrides.')}
                  onOverride={() => setValue(`${namePrefix}.dateControl.dueDate` as any, '')}
                  onRemoveOverride={() =>
                    setValue(`${namePrefix}.dateControl.dueDate` as any, undefined)
                  }
                >
                  <Form.Group>
                    <div class="mb-2">
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-dueMode`}
                        id={`${namePrefix}-due-never`}
                        label="No due date"
                        checked={!dueDateEnabled}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.dueDate` as any, null);
                          }
                        }}
                      />
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-dueMode`}
                        id={`${namePrefix}-due-on-date`}
                        label="Due on date"
                        checked={dueDateEnabled && dueDate !== null}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.dueDate` as any, '');
                          }
                        }}
                      />
                    </div>
                    {dueDateEnabled && dueDate !== null && (
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
                                    –{' '}
                                    <FriendlyDate
                                      date={dueDateObj}
                                      timezone={userTimezone}
                                      options={{ includeTz: false }}
                                    />{' '}
                                    (100% credit)
                                  </>
                                );
                              } else if (releaseDateEnabled && releaseDate) {
                                // No early deadlines, use release date
                                const releaseDateObj = new Date(releaseDate);
                                return (
                                  <>
                                    <FriendlyDate
                                      date={releaseDateObj}
                                      timezone={userTimezone}
                                      options={{ includeTz: false }}
                                    />{' '}
                                    –{' '}
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
                                    While accessible –{' '}
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
                {dueDateEnabled && dueDate && dueDate !== null && (
                  <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <div class="d-flex align-items-center">
                        <Form.Check
                          type="checkbox"
                          class="me-2"
                          checked={earlyDeadlinesActive}
                          onChange={(e) => {
                            const checked = (e.target as HTMLInputElement).checked;
                            setEarlyDeadlinesActive(checked);

                            // If enabling and no data exists, create empty array
                            if (checked && !hasEarlyDeadlinesData) {
                              setValue(`${namePrefix}.dateControl.earlyDeadlines` as any, []);
                            }
                          }}
                        />
                        <span>Early Deadlines</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={!earlyDeadlinesActive}
                        onClick={addEarlyDeadline}
                      >
                        Add Early
                      </Button>
                    </div>

                    {hasEarlyDeadlinesData &&
                      earlyDeadlineFields.map((field, index) => (
                        <div
                          key={field.id}
                          class="mb-3"
                          style={{
                            opacity: earlyDeadlinesActive ? 1 : 0.5,
                            pointerEvents: earlyDeadlinesActive ? 'auto' : 'none',
                          }}
                        >
                          <Row class="mb-1">
                            <Col md={6}>
                              <Form.Control
                                type="datetime-local"
                                placeholder="Deadline Date"
                                {...control.register(
                                  `mainRule.dateControl.earlyDeadlines.${index}.date`,
                                  {
                                    deps: ['mainRule.dateControl.dueDate'],
                                    validate: (value) => {
                                      // Skip validation if deadlines are inactive
                                      if (!earlyDeadlinesActive) {
                                        return true;
                                      }

                                      if (!value) {
                                        return 'Date is required';
                                      }
                                      const deadlineDate = new Date(value);
                                      const currentDueDate = new Date(dueDate);

                                      // Check if before due date
                                      if (deadlineDate >= currentDueDate) {
                                        return 'Early deadline must be before due date';
                                      }

                                      // Check if after previous deadline (if not first)
                                      if (index > 0) {
                                        const previousDeadline = earlyDeadlines?.[index - 1];
                                        if (previousDeadline?.date) {
                                          const previousDate = new Date(previousDeadline.date);
                                          if (deadlineDate <= previousDate) {
                                            return 'Must be after previous early deadline';
                                          }
                                        }
                                      }

                                      // Check if after release date (if first deadline and release date exists)
                                      if (index === 0 && releaseDateEnabled && releaseDate) {
                                        const currentReleaseDate = new Date(releaseDate);
                                        if (deadlineDate < currentReleaseDate) {
                                          return 'Must be after release date';
                                        }
                                      }

                                      return true;
                                    },
                                  },
                                )}
                              />
                              {getEarlyDeadlineError(index) && (
                                <Form.Text class="text-danger">
                                  {getEarlyDeadlineError(index)}
                                </Form.Text>
                              )}
                            </Col>
                            <Col md={4}>
                              <InputGroup>
                                <Form.Control
                                  type="number"
                                  placeholder="Credit"
                                  min="101"
                                  max="200"
                                  {...control.register(
                                    `mainRule.dateControl.earlyDeadlines.${index}.credit`,
                                    {
                                      valueAsNumber: true,
                                      validate: (value) => {
                                        // Skip validation if deadlines are inactive
                                        if (!earlyDeadlinesActive) {
                                          return true;
                                        }

                                        if (value === undefined || value === null) {
                                          return 'Credit is required';
                                        }
                                        if (value < 101 || value > 200) {
                                          return 'Must be 101-200%';
                                        }
                                        return true;
                                      },
                                    },
                                  )}
                                />
                                <InputGroup.Text>%</InputGroup.Text>
                              </InputGroup>
                              {getEarlyDeadlineCreditError(index) && (
                                <Form.Text class="text-danger">
                                  {getEarlyDeadlineCreditError(index)}
                                </Form.Text>
                              )}
                            </Col>
                            <Col md={2} class="d-flex align-items-start">
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => removeEarlyDeadline(index)}
                              >
                                <i class="bi bi-trash" aria-hidden="true" />
                              </Button>
                            </Col>
                          </Row>
                          <Form.Text class="text-muted">
                            {getEarlyDeadlineTimeRange(index)}
                          </Form.Text>
                        </div>
                      ))}
                  </div>
                )}
              </Col>

              <Col md={6}>
                {/* Late Deadlines */}
                {dueDateEnabled && dueDate && dueDate !== null && (
                  <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <div class="d-flex align-items-center">
                        <Form.Check
                          type="checkbox"
                          class="me-2"
                          checked={lateDeadlinesActive}
                          onChange={(e) => {
                            const checked = (e.target as HTMLInputElement).checked;
                            setLateDeadlinesActive(checked);

                            // If enabling and no data exists, create empty array
                            if (checked && !hasLateDeadlinesData) {
                              setValue(`${namePrefix}.dateControl.lateDeadlines` as any, []);
                            }
                          }}
                        />
                        <span>Late Deadlines</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={!lateDeadlinesActive}
                        onClick={addLateDeadline}
                      >
                        Add Late
                      </Button>
                    </div>

                    {hasLateDeadlinesData &&
                      lateDeadlineFields.map((field, index) => (
                        <div
                          key={field.id}
                          class="mb-3"
                          style={{
                            opacity: lateDeadlinesActive ? 1 : 0.5,
                            pointerEvents: lateDeadlinesActive ? 'auto' : 'none',
                          }}
                        >
                          <Row class="mb-1">
                            <Col md={6}>
                              <Form.Control
                                type="datetime-local"
                                placeholder="Deadline Date"
                                {...control.register(
                                  `mainRule.dateControl.lateDeadlines.${index}.date`,
                                  {
                                    deps: ['mainRule.dateControl.dueDate'],
                                    validate: (value) => {
                                      // Skip validation if deadlines are inactive
                                      if (!lateDeadlinesActive) {
                                        return true;
                                      }

                                      if (!value) {
                                        return 'Date is required';
                                      }
                                      const deadlineDate = new Date(value);
                                      const currentDueDate = new Date(dueDate);

                                      // Check if after due date
                                      if (deadlineDate <= currentDueDate) {
                                        return 'Late deadline must be after due date';
                                      }

                                      // Check if after previous deadline (if not first)
                                      if (index > 0) {
                                        const previousDeadline = lateDeadlines?.[index - 1];
                                        if (previousDeadline?.date) {
                                          const previousDate = new Date(previousDeadline.date);
                                          if (deadlineDate <= previousDate) {
                                            return 'Must be after previous late deadline';
                                          }
                                        }
                                      }

                                      return true;
                                    },
                                  },
                                )}
                              />
                              {getLateDeadlineError(index) && (
                                <Form.Text class="text-danger">
                                  {getLateDeadlineError(index)}
                                </Form.Text>
                              )}
                            </Col>
                            <Col md={4}>
                              <InputGroup>
                                <Form.Control
                                  type="number"
                                  placeholder="Credit"
                                  min="0"
                                  max="99"
                                  {...control.register(
                                    `mainRule.dateControl.lateDeadlines.${index}.credit`,
                                    {
                                      valueAsNumber: true,
                                      validate: (value) => {
                                        // Skip validation if deadlines are inactive
                                        if (!lateDeadlinesActive) {
                                          return true;
                                        }

                                        if (value === undefined || value === null) {
                                          return 'Credit is required';
                                        }
                                        if (value < 0 || value > 99) {
                                          return 'Must be 0-99%';
                                        }
                                        return true;
                                      },
                                    },
                                  )}
                                />
                                <InputGroup.Text>%</InputGroup.Text>
                              </InputGroup>
                              {getLateDeadlineCreditError(index) && (
                                <Form.Text class="text-danger">
                                  {getLateDeadlineCreditError(index)}
                                </Form.Text>
                              )}
                            </Col>
                            <Col md={2} class="d-flex align-items-start">
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => removeLateDeadline(index)}
                              >
                                <i class="bi bi-trash" aria-hidden="true" />
                              </Button>
                            </Col>
                          </Row>
                          <Form.Text class="text-muted">
                            {getLateDeadlineTimeRange(index)}
                          </Form.Text>
                        </div>
                      ))}
                  </div>
                )}
              </Col>
            </Row>

            {/* After Last Deadline */}
            {((dueDateEnabled && dueDate && dueDate !== null) || lateDeadlinesEnabled) && (
              <Card class="mb-3">
                <Card.Header>
                  <div>
                    <strong>After Last Deadline</strong>
                    <br />
                    <small class="text-muted">{getLastDeadlineText()}</small>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Form.Group>
                    <div class="mb-2">
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-afterLastDeadlineMode`}
                        id={`${namePrefix}-after-deadline-no-submissions`}
                        label="No submissions allowed"
                        checked={afterLastDeadlineMode === 'no_submissions'}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
                              false,
                            );
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.credit` as any,
                              undefined,
                            );
                          }
                        }}
                      />
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-afterLastDeadlineMode`}
                        id={`${namePrefix}-after-deadline-practice-submissions`}
                        label="Allow practice submissions"
                        checked={afterLastDeadlineMode === 'practice_submissions'}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
                              true,
                            );
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.credit` as any,
                              undefined,
                            );
                          }
                        }}
                      />
                      <Form.Text class="text-muted ms-4">
                        No credit is given for practice submissions
                      </Form.Text>
                      <Form.Check
                        type="radio"
                        name={`${namePrefix}-afterLastDeadlineMode`}
                        id={`${namePrefix}-after-deadline-partial-credit`}
                        label="Allow submissions for partial credit"
                        checked={afterLastDeadlineMode === 'partial_credit'}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
                              true,
                            );
                            setValue(
                              `${namePrefix}.dateControl.afterLastDeadline.credit` as any,
                              0,
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
                              `${namePrefix}.dateControl.afterLastDeadline.credit` as any,
                              {
                                valueAsNumber: true,
                              },
                            )}
                          />
                          <InputGroup.Text>%</InputGroup.Text>
                        </InputGroup>
                        <Form.Text class="text-muted">
                          Students will receive this percentage of credit for submissions after the
                          deadline
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
                  isOverridden={durationMinutes !== undefined}
                  showOverrideButton={namePrefix.startsWith('overrides.')}
                  onOverride={() =>
                    setValue(`${namePrefix}.dateControl.durationMinutes` as any, 60)
                  }
                  onRemoveOverride={() =>
                    setValue(`${namePrefix}.dateControl.durationMinutes` as any, undefined)
                  }
                >
                  <Form.Group>
                    <div class="d-flex align-items-center mb-2">
                      <Form.Check
                        type="checkbox"
                        class="me-2"
                        checked={durationMinutesEnabled}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.durationMinutes` as any, 60);
                          } else {
                            setValue(
                              `${namePrefix}.dateControl.durationMinutes` as any,
                              namePrefix.startsWith('overrides.') ? undefined : null,
                            );
                          }
                        }}
                      />
                      <Form.Label class="mb-0">Time limit</Form.Label>
                    </div>
                    {durationMinutesEnabled && durationMinutes !== null && (
                      <InputGroup>
                        <Form.Control
                          type="number"
                          placeholder="Duration in minutes"
                          min="1"
                          {...control.register(`${namePrefix}.dateControl.durationMinutes` as any, {
                            valueAsNumber: true,
                          })}
                        />
                        <InputGroup.Text>minutes</InputGroup.Text>
                      </InputGroup>
                    )}
                    <Form.Text class="text-muted">
                      {durationMinutesEnabled && durationMinutes !== null
                        ? `Students will have ${durationMinutes} minutes to complete the assessment.`
                        : 'Add a time limit to the assessment.'}
                    </Form.Text>
                  </Form.Group>
                </OverrideElement>
              </Col>
              <Col md={6}>
                <OverrideElement
                  isOverridden={password !== undefined}
                  showOverrideButton={namePrefix.startsWith('overrides.')}
                  onOverride={() => setValue(`${namePrefix}.dateControl.password` as any, '')}
                  onRemoveOverride={() =>
                    setValue(`${namePrefix}.dateControl.password` as any, undefined)
                  }
                >
                  <Form.Group>
                    <div class="d-flex align-items-center mb-2">
                      <Form.Check
                        type="checkbox"
                        class="me-2"
                        checked={passwordEnabled}
                        onChange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            setValue(`${namePrefix}.dateControl.password` as any, '');
                          } else {
                            setValue(
                              `${namePrefix}.dateControl.password` as any,
                              namePrefix.startsWith('overrides.') ? undefined : null,
                            );
                          }
                        }}
                      />
                      <Form.Label class="mb-0">Password</Form.Label>
                    </div>
                    {passwordEnabled && password !== null && (
                      <InputGroup>
                        <Form.Control
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Password"
                          {...control.register(`${namePrefix}.dateControl.password` as any)}
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
                      {passwordEnabled && password !== null
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
    </Card>
  );
}
