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

  const showAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDateEnabled`,
  });

  const hideAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDateEnabled`,
  });

  const showAgainDateEnabledScore = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDateEnabled`,
  });

  // Watch date values for validation
  const showAgainDate = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate`,
  });

  const hideAgainDate = useWatch({
    control,
    name: `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate`,
  });

  // Determine the current radio selection for hide questions
  const getHideQuestionsMode = () => {
    if (hideQuestions === false) return 'show_questions';
    if (hideQuestions === true && showAgainDateEnabledQuestions === false)
      return 'hide_questions_forever';
    if (
      hideQuestions === true &&
      showAgainDateEnabledQuestions === true &&
      hideAgainDateEnabledQuestions === false
    )
      return 'hide_questions_until_date';
    if (
      hideQuestions === true &&
      showAgainDateEnabledQuestions === true &&
      hideAgainDateEnabledQuestions === true
    )
      return 'hide_questions_between_dates';
    return 'show_questions';
  };

  const hideQuestionsMode = getHideQuestionsMode();

  // Determine the current radio selection for hide score
  const getHideScoreMode = () => {
    if (hideScore === false) return 'show_score';
    if (hideScore === true && showAgainDateEnabledScore === false) return 'hide_score_forever';
    if (hideScore === true && showAgainDateEnabledScore === true) return 'hide_score_until_date';
    return 'show_score';
  };

  const hideScoreMode = getHideScoreMode();

  // Watch completion criteria
  const dateControlEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.enabled`,
  });

  const durationMinutesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutesEnabled`,
  });

  const durationMinutes = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutes`,
  });

  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDate`,
  });

  const dueDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDateEnabled` as const,
    defaultValue: false,
  });

  const lateDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlines`,
  });

  const lateDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlinesEnabled`,
  });

  const prairieTestEnabled = useWatch({
    control,
    name: `${namePrefix}.prairieTestControl.enabled`,
  });

  const prairieTestExams = useWatch({
    control,
    name: `${namePrefix}.prairieTestControl.exams`,
  });

  // Generate completion explanation
  const getCompletionCriteria = () => {
    const criteria: (string | string[])[] = [];

    // Permanent criteria - always included
    criteria.push('Assessment is manually closed by an instructor');

    // Exam-specific permanent criteria
    if (assessmentType === 'Exam') {
      criteria.push('Exam assessments are auto-closed after 6 hours of inactivity');
    }

    // Time limit (only if Date Control is enabled)
    if (dateControlEnabled === true && durationMinutesEnabled === true && durationMinutes) {
      criteria.push(`${durationMinutes} minutes after starting`);
    }

    // Deadlines (only if Date Control is enabled)
    if (
      dateControlEnabled === true &&
      lateDeadlinesEnabled === true &&
      dueDateEnabled === true &&
      dueDate &&
      lateDeadlines?.length &&
      lateDeadlines.length > 0
    ) {
      const validLateDeadlines = lateDeadlines.filter((deadline) => deadline?.date);
      if (validLateDeadlines.length > 0) {
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const latestLateDeadline = sortedLateDeadlines[0];
        if (latestLateDeadline.date) {
          const date = new Date(latestLateDeadline.date);
          criteria.push(`${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
        }
      }
    } else if (dateControlEnabled === true && dueDateEnabled === true && dueDate) {
      const date = new Date(dueDate);
      criteria.push(`${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
    }

    // PrairieTest Control
    if (prairieTestEnabled === true && prairieTestExams && prairieTestExams.length > 0) {
      const validExams = prairieTestExams.filter((exam) => exam?.examUuid);
      const subList = validExams.map((exam) => exam.examUuid);
      criteria.push('When any of these exams ends:', subList);
    }

    return criteria;
  };

  // Get completion criteria (always has permanent criteria)
  const criteria = getCompletionCriteria();
  const completionExplanation = (
    <ul>
      {criteria.map((criterion) =>
        Array.isArray(criterion) ? (
          <ul key={criterion[0]}>
            {criterion.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <li key={criterion}>{criterion}</li>
        ),
      )}
    </ul>
  );
  // Helper function to get the last deadline for validation
  const getLastDeadlineDate = (): string | null => {
    // Only consider dates if Date Control is enabled
    if (dateControlEnabled !== true) return null;

    // Check late deadlines first
    if (
      lateDeadlinesEnabled === true &&
      dueDateEnabled === true &&
      dueDate &&
      lateDeadlines &&
      lateDeadlines.length > 0
    ) {
      const validLateDeadlines = lateDeadlines.filter((deadline) => deadline?.date);
      if (validLateDeadlines.length > 0) {
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        return sortedLateDeadlines[0].date || null;
      }
    } else if (dueDateEnabled === true && dueDate) {
      return dueDate;
    }

    return null;
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
          <h6 class="mb-0">{title}</h6>
          <small class="text-muted">
            {description}{' '}
            <OverlayTrigger
              trigger="click"
              placement="bottom"
              overlay={
                <Popover>
                  <Popover.Header as="h3">Completion Criteria</Popover.Header>
                  <Popover.Body>
                    <div style={{ whiteSpace: 'pre-line' }}>{completionExplanation}</div>
                  </Popover.Body>
                </Popover>
              }
            >
              <span
                style={{
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  color: '#0d6efd',
                }}
              >
                How can this assessment be marked complete?
              </span>
            </OverlayTrigger>
          </small>
        </div>
        <div class="d-flex align-items-center">
          {showOverrideButton && onOverride && (
            <Button size="sm" variant="outline-primary" onClick={onOverride} class="me-2">
              Override
            </Button>
          )}
          {collapsible && (
            <i class={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden="true" />
          )}
        </div>
      </Card.Header>
      <Collapse in={!collapsible || isExpanded}>
        <Card.Body
          style={{
            opacity: showOverrideButton ? 0.5 : 1,
            pointerEvents: showOverrideButton ? 'none' : 'auto',
          }}
        >
          {/* Hide Questions */}
          <Card class="mb-3">
            <Card.Header>
              <Form.Check
                type="checkbox"
                label="Hide Questions"
                disabled={!ruleEnabled}
                {...control.register(`${namePrefix}.afterComplete.hideQuestions`)}
              />
              {hideQuestions === true && (
                <Form.Text class="text-muted d-block mt-1">
                  {hideQuestionsMode === 'hide_questions_forever' &&
                    'Questions will be hidden after completion.'}
                  {hideQuestionsMode === 'hide_questions_until_date' &&
                    showAgainDate &&
                    `Questions will be hidden after completion until ${new Date(showAgainDate).toLocaleDateString()} at ${new Date(showAgainDate).toLocaleTimeString()}.`}
                  {hideQuestionsMode === 'hide_questions_between_dates' &&
                    showAgainDate &&
                    hideAgainDate &&
                    hideAgainDateEnabledQuestions &&
                    `Questions will be hidden after completion and only shown between ${new Date(showAgainDate).toLocaleDateString()} at ${new Date(showAgainDate).toLocaleTimeString()} — ${new Date(hideAgainDate).toLocaleDateString()} at ${new Date(hideAgainDate).toLocaleTimeString()}.`}
                </Form.Text>
              )}
              {hideQuestions === false && (
                <Form.Text class="text-muted d-block mt-1">
                  Questions will be visible after completion
                </Form.Text>
              )}
            </Card.Header>
            {hideQuestions === true && (
              <Card.Body>
                <Form.Group>
                  <div class="mb-2">
                    <Form.Check
                      type="radio"
                      id="hide-questions-forever"
                      label="Hide questions after completion"
                      checked={hideQuestionsMode === 'hide_questions_forever'}
                      disabled={!ruleEnabled}
                      onChange={() => {
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDateEnabled`,
                          false,
                        );
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDateEnabled`,
                          false,
                        );
                      }}
                    />
                    <Form.Check
                      type="radio"
                      id="hide-questions-until-date"
                      label="Hide questions until date"
                      checked={hideQuestionsMode === 'hide_questions_until_date'}
                      disabled={!ruleEnabled}
                      onChange={() => {
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDateEnabled`,
                          true,
                        );
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDateEnabled`,
                          false,
                        );
                      }}
                    />
                    {hideQuestionsMode === 'hide_questions_until_date' && (
                      <div class="ms-4">
                        <Form.Control
                          type="datetime-local"
                          placeholder="Show Again Date"
                          disabled={!ruleEnabled}
                          {...control.register(
                            `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate`,
                            {
                              validate: (value) => {
                                if (!value) return true;
                                const lastDeadline = getLastDeadlineDate();
                                if (lastDeadline) {
                                  const showDate = new Date(value);
                                  const lastDate = new Date(lastDeadline);
                                  return (
                                    showDate > lastDate ||
                                    'Show Again Date must be after the last deadline'
                                  );
                                }
                                return true;
                              },
                            },
                          )}
                        />
                      </div>
                    )}
                    <Form.Check
                      type="radio"
                      id="hide-questions-between-dates"
                      label="Show questions between dates"
                      checked={hideQuestionsMode === 'hide_questions_between_dates'}
                      disabled={!ruleEnabled}
                      onChange={() => {
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDateEnabled`,
                          true,
                        );
                        setValue(
                          `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDateEnabled`,
                          true,
                        );
                      }}
                    />
                    {hideQuestionsMode === 'hide_questions_between_dates' && (
                      <div class="ms-4">
                        <Row>
                          <Col md={6}>
                            <Form.Control
                              type="datetime-local"
                              placeholder="Show Again Date"
                              disabled={!ruleEnabled}
                              {...control.register(
                                `${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDate`,
                                {
                                  validate: (value) => {
                                    if (!value) return true;
                                    const lastDeadline = getLastDeadlineDate();
                                    if (lastDeadline) {
                                      const showDate = new Date(value);
                                      const lastDate = new Date(lastDeadline);
                                      return (
                                        showDate > lastDate ||
                                        'Show Again Date must be after the last deadline'
                                      );
                                    }
                                    return true;
                                  },
                                },
                              )}
                            />
                          </Col>
                          <Col md={6}>
                            <Form.Control
                              type="datetime-local"
                              placeholder="Hide Again Date"
                              disabled={!ruleEnabled}
                              {...control.register(
                                `${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDate`,
                                {
                                  validate: (value) => {
                                    if (!value || !showAgainDate) return true;
                                    const hideDate = new Date(value);
                                    const showDate = new Date(showAgainDate);
                                    return (
                                      hideDate > showDate ||
                                      'Hide Again Date must be after the Show Again Date'
                                    );
                                  },
                                },
                              )}
                            />
                          </Col>
                        </Row>
                      </div>
                    )}
                  </div>
                </Form.Group>
              </Card.Body>
            )}
          </Card>

          {/* Hide Score */}
          <Card>
            <Card.Header>
              <Form.Check
                type="checkbox"
                label="Hide Score"
                disabled={!ruleEnabled}
                {...control.register(`${namePrefix}.afterComplete.hideScore`)}
              />
              {hideScore === true && (
                <Form.Text class="text-muted d-block mt-1">
                  {hideScoreMode === 'hide_score_forever' &&
                    'Score will be hidden after completion.'}
                  {hideScoreMode === 'hide_score_until_date' &&
                    showAgainDate &&
                    `Score will be hidden after completion until ${new Date(showAgainDate).toLocaleDateString()} at ${new Date(showAgainDate).toLocaleTimeString()}.`}
                </Form.Text>
              )}
              {hideScore === false && (
                <Form.Text class="text-muted d-block mt-1">
                  Score will be visible after completion
                </Form.Text>
              )}
            </Card.Header>
            {hideScore === true && (
              <Card.Body>
                <Form.Group>
                  <div class="mb-2">
                    <Form.Check
                      type="radio"
                      id="hide-score-forever"
                      label="Hide score after completion"
                      checked={hideScoreMode === 'hide_score_forever'}
                      disabled={!ruleEnabled}
                      onChange={() => {
                        setValue(
                          `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDateEnabled`,
                          false,
                        );
                      }}
                    />
                    <Form.Check
                      type="radio"
                      id="hide-score-until-date"
                      label="Hide score until date"
                      checked={hideScoreMode === 'hide_score_until_date'}
                      disabled={!ruleEnabled}
                      onChange={() => {
                        setValue(
                          `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDateEnabled`,
                          true,
                        );
                      }}
                    />
                    {hideScoreMode === 'hide_score_until_date' && (
                      <div class="ms-4">
                        <Form.Control
                          type="datetime-local"
                          placeholder="Show Again Date"
                          disabled={!ruleEnabled}
                          {...control.register(
                            `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate`,
                          )}
                        />
                      </div>
                    )}
                  </div>
                </Form.Group>
              </Card.Body>
            )}
          </Card>
        </Card.Body>
      </Collapse>
    </Card>
  );
}
