import { useState } from 'preact/compat';
import { Button, Card, Col, Collapse, Form, OverlayTrigger, Popover, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule' | `overrides.${number}`;
  ruleEnabled?: boolean;
  assessmentType?: 'Exam' | 'Homework';
  setValue: UseFormSetValue<AccessControlFormData>;
  showOverrideButton?: boolean;
  onOverride?: () => void;
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function AfterCompleteForm({
  control,
  namePrefix,
  ruleEnabled = true,
  assessmentType,
  setValue,
  showOverrideButton = false,
  onOverride,
  title = 'After Completion Behavior',
  description = 'Configure what happens after students complete the assessment',
  collapsible = false,
  defaultExpanded = true,
}: AfterCompleteFormProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hideQuestions = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestions`,
  });

  const hideScore = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideScore`,
  });

  // Watch date values - presence indicates enabled
  const showAgainDateQuestions = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate`,
  });

  const hideAgainDateQuestions = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate`,
  });

  const showAgainDateScore = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate`,
  });

  // Derive enabled states from field presence
  const showAgainDateEnabledQuestions = showAgainDateQuestions !== undefined;
  const hideAgainDateEnabledQuestions = hideAgainDateQuestions !== undefined;
  const showAgainDateEnabledScore = showAgainDateScore !== undefined;

  // Determine the current radio selection for hide questions
  const getHideQuestionsMode = () => {
    if (hideQuestions === false) return 'show_questions';
    if (hideQuestions === true && !showAgainDateEnabledQuestions) {
      return 'hide_questions_forever';
    }
    if (hideQuestions === true && showAgainDateEnabledQuestions && !hideAgainDateEnabledQuestions) {
      return 'hide_questions_until_date';
    }
    if (hideQuestions === true && showAgainDateEnabledQuestions && hideAgainDateEnabledQuestions) {
      return 'hide_questions_between_dates';
    }
    return 'show_questions';
  };

  const hideQuestionsMode = getHideQuestionsMode();

  // Determine the current radio selection for hide score
  const getHideScoreMode = () => {
    if (hideScore === false) return 'show_score';
    if (hideScore === true && !showAgainDateEnabledScore) return 'hide_score_forever';
    if (hideScore === true && showAgainDateEnabledScore) return 'hide_score_until_date';
    return 'show_score';
  };

  const hideScoreMode = getHideScoreMode();

  const getCardStyle = () => {
    return showOverrideButton ? { border: '2px dashed #dee2e6', borderColor: '#dee2e6' } : {};
  };

  const toggleExpanded = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  const infoPopover = (
    <Popover id="after-complete-info-popover">
      <Popover.Header as="h3">When is an assessment "complete"?</Popover.Header>
      <Popover.Body>
        <p>
          An assessment is considered complete when students can no longer answer questions. This
          typically happens when:
        </p>
        <ul>
          <li>The time limit expires (if durationMinutes is set)</li>
          <li>The last late deadline passes (or due date if no late deadlines)</li>
          <li>PrairieTest marks the assessment as complete</li>
        </ul>
        <p>
          The completion date can be different for different students based on when they started or
          their specific accommodations.
        </p>
      </Popover.Body>
    </Popover>
  );

  return (
    <Card class="mb-4" style={getCardStyle()}>
      <Card.Header
        class="d-flex justify-content-between align-items-center"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        onClick={toggleExpanded}
      >
        <div>
          <div class="d-flex align-items-center">
            <span>{title}</span>
            <OverlayTrigger trigger="click" placement="right" overlay={infoPopover}>
              <Button variant="link" size="sm" class="ms-2 p-0">
                <i class="bi bi-info-circle" aria-hidden="true" />
              </Button>
            </OverlayTrigger>
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
      <Collapse in={!collapsible || isExpanded}>
        <Card.Body>
          <div>
            {/* Hide Questions Section */}
            <Card class="mb-3">
              <Card.Header>
                <strong>Question Visibility</strong>
              </Card.Header>
              <Card.Body>
                <Form.Group>
                  <div class="mb-2">
                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideQuestionsMode`}
                      id={`${namePrefix}-show-questions`}
                      label="Show questions after completion"
                      checked={hideQuestionsMode === 'show_questions'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideQuestions` as any, false);
                          // Clear date controls
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                            undefined,
                          );
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate` as any,
                            undefined,
                          );
                        }
                      }}
                    />
                    <Form.Text class="text-muted ms-4">
                      Students can see questions and answers immediately after completing the
                      assessment
                    </Form.Text>

                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideQuestionsMode`}
                      id={`${namePrefix}-hide-questions-forever`}
                      label="Hide questions permanently"
                      checked={hideQuestionsMode === 'hide_questions_forever'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideQuestions` as any, true);
                          // Clear date controls
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                            undefined,
                          );
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate` as any,
                            undefined,
                          );
                        }
                      }}
                    />
                    <Form.Text class="text-muted ms-4">
                      Questions will never be visible after completion
                    </Form.Text>

                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideQuestionsMode`}
                      id={`${namePrefix}-hide-questions-until-date`}
                      label="Hide questions until date"
                      checked={hideQuestionsMode === 'hide_questions_until_date'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideQuestions` as any, true);
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                            '',
                          );
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate` as any,
                            undefined,
                          );
                        }
                      }}
                    />
                    {hideQuestionsMode === 'hide_questions_until_date' && (
                      <div class="ms-4 mt-2">
                        <Form.Label>Show questions again on:</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          {...control.register(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                          )}
                        />
                        <Form.Text class="text-muted">
                          Questions will be hidden after completion and become visible again on this
                          date
                        </Form.Text>
                      </div>
                    )}

                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideQuestionsMode`}
                      id={`${namePrefix}-hide-questions-between-dates`}
                      label="Hide questions between dates"
                      checked={hideQuestionsMode === 'hide_questions_between_dates'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideQuestions` as any, true);
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                            '',
                          );
                          setValue(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate` as any,
                            '',
                          );
                        }
                      }}
                    />
                    {hideQuestionsMode === 'hide_questions_between_dates' && (
                      <div class="ms-4 mt-2">
                        <Row class="mb-2">
                          <Col md={6}>
                            <Form.Label>Show questions again on:</Form.Label>
                            <Form.Control
                              type="datetime-local"
                              {...control.register(
                                `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate` as any,
                                {
                                  validate: (value) => {
                                    if (!value) return 'Show date is required';
                                    if (hideAgainDateQuestions) {
                                      const showDate = new Date(value);
                                      const hideDate = new Date(hideAgainDateQuestions);
                                      if (showDate >= hideDate) {
                                        return 'Show date must be before hide date';
                                      }
                                    }
                                    return true;
                                  },
                                },
                              )}
                            />
                          </Col>
                          <Col md={6}>
                            <Form.Label>Hide questions again on:</Form.Label>
                            <Form.Control
                              type="datetime-local"
                              {...control.register(
                                `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate` as any,
                                {
                                  validate: (value) => {
                                    if (!value) return 'Hide date is required';
                                    if (showAgainDateQuestions) {
                                      const showDate = new Date(showAgainDateQuestions);
                                      const hideDate = new Date(value);
                                      if (hideDate <= showDate) {
                                        return 'Hide date must be after show date';
                                      }
                                    }
                                    return true;
                                  },
                                },
                              )}
                            />
                          </Col>
                        </Row>
                        <Form.Text class="text-muted">
                          Questions will be visible between these dates, hidden before and after
                        </Form.Text>
                      </div>
                    )}
                  </div>
                </Form.Group>
              </Card.Body>
            </Card>

            {/* Hide Score Section */}
            <Card class="mb-3">
              <Card.Header>
                <strong>Score Visibility</strong>
              </Card.Header>
              <Card.Body>
                <Form.Group>
                  <div class="mb-2">
                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideScoreMode`}
                      id={`${namePrefix}-show-score`}
                      label="Show score after completion"
                      checked={hideScoreMode === 'show_score'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideScore` as any, false);
                          // Clear date control
                          setValue(
                            `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate` as any,
                            undefined,
                          );
                        }
                      }}
                    />
                    <Form.Text class="text-muted ms-4">
                      Students can see their score immediately after completing the assessment
                    </Form.Text>

                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideScoreMode`}
                      id={`${namePrefix}-hide-score-forever`}
                      label="Hide score permanently"
                      checked={hideScoreMode === 'hide_score_forever'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideScore` as any, true);
                          // Clear date control
                          setValue(
                            `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate` as any,
                            undefined,
                          );
                        }
                      }}
                    />
                    <Form.Text class="text-muted ms-4">
                      Score will never be visible after completion
                    </Form.Text>

                    <Form.Check
                      type="radio"
                      name={`${namePrefix}-hideScoreMode`}
                      id={`${namePrefix}-hide-score-until-date`}
                      label="Hide score until date"
                      checked={hideScoreMode === 'hide_score_until_date'}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setValue(`${namePrefix}.afterComplete.hideScore` as any, true);
                          setValue(
                            `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate` as any,
                            '',
                          );
                        }
                      }}
                    />
                    {hideScoreMode === 'hide_score_until_date' && (
                      <div class="ms-4 mt-2">
                        <Form.Label>Show score again on:</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          {...control.register(
                            `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate` as any,
                          )}
                        />
                        <Form.Text class="text-muted">
                          Score will be hidden after completion and become visible again on this
                          date
                        </Form.Text>
                      </div>
                    )}
                  </div>
                </Form.Group>
              </Card.Body>
            </Card>

            {assessmentType === 'Exam' && (
              <div class="alert alert-info">
                <i class="bi bi-info-circle me-2" aria-hidden="true" />
                <strong>Note for Exams:</strong> Consider hiding questions and scores until after
                all students have completed to maintain fairness. You can use the "until date"
                options to reveal them after the exam window closes.
              </div>
            )}
          </div>
        </Card.Body>
      </Collapse>
    </Card>
  );
}
