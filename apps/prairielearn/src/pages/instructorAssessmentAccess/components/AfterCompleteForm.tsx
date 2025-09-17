import { Card, Col, Form, OverlayTrigger, Popover, Row } from 'react-bootstrap';
import { type Control, useWatch } from 'react-hook-form';

import { TriStateCheckbox } from './TriStateCheckbox.js';
import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule' | `overrides.${number}`;
  ruleEnabled?: boolean;
}

export function AfterCompleteForm({
  control,
  namePrefix,
  ruleEnabled = true,
}: AfterCompleteFormProps) {
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
    name: `${namePrefix}.dateControl.dueDateEnabled`,
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

    // Time limit (only if Date Control is enabled)
    if (dateControlEnabled && durationMinutesEnabled && durationMinutes) {
      criteria.push(`${durationMinutes} minutes after starting`);
    }

    // Deadlines (only if Date Control is enabled)
    if (
      dateControlEnabled &&
      lateDeadlinesEnabled &&
      dueDateEnabled &&
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
    } else if (dateControlEnabled && dueDateEnabled && dueDate) {
      const date = new Date(dueDate);
      criteria.push(`${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
    }

    // PrairieTest Control
    if (prairieTestEnabled && prairieTestExams && prairieTestExams.length > 0) {
      const validExams = prairieTestExams.filter((exam) => exam?.examUuid);
      const subList = validExams.map((exam) => exam.examUuid);
      criteria.push('When any of these exams ends:', subList);
    }

    return criteria;
  };

  // Check if there are completion criteria by getting the explanation and checking if it has criteria
  const criteria = getCompletionCriteria();
  const defaultCriteria = [
    "When the student's time limit is reached",
    'After the due date/last deadline',
    'When a PrairieTest exam ends',
  ];
  const completionExplanation = (
    <ul>
      {(criteria.length > 0 ? criteria : defaultCriteria).map((criterion) =>
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
  const hasCompletion = criteria.length > 0;
  // Helper function to get the last deadline for validation
  const getLastDeadlineDate = (): string | null => {
    // Only consider dates if Date Control is enabled
    if (!dateControlEnabled) return null;

    // Check late deadlines first
    if (
      lateDeadlinesEnabled &&
      dueDateEnabled &&
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
    } else if (dueDateEnabled && dueDate) {
      return dueDate;
    }

    return null;
  };

  // Helper function to generate hide questions explanation text
  const getHideQuestionsText = () => {
    if (!hideQuestions) return null;

    const showEnabled = showAgainDateEnabledQuestions && showAgainDate;
    const hideEnabled = hideAgainDateEnabledQuestions && hideAgainDate;

    if (showEnabled && hideEnabled) {
      const showDate = new Date(showAgainDate);
      const hideDate = new Date(hideAgainDate);
      return `Questions will be hidden after completion and only shown between ${showDate.toLocaleDateString()} at ${showDate.toLocaleTimeString()} — ${hideDate.toLocaleDateString()} at ${hideDate.toLocaleTimeString()}.`;
    } else if (showEnabled) {
      const showDate = new Date(showAgainDate);
      return `Questions will be hidden after completion until ${showDate.toLocaleDateString()} at ${showDate.toLocaleTimeString()}.`;
    } else {
      return 'Questions will be hidden after completion.';
    }
  };

  return (
    <Card class="mb-4">
      <Card.Header>
        <div>
          <h6 class="mb-0">After Completion Behavior</h6>
          <small class="text-muted">
            An assessment is complete when a student can no longer make attempts on it.{' '}
            {!hasCompletion && (
              <>
                <i class="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                <strong>No completion criteria configured.</strong>
              </>
            )}{' '}
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
                What counts as completion?
              </span>
            </OverlayTrigger>
          </small>
        </div>
      </Card.Header>
      <Card.Body>
        {/* Hide Questions */}
        <Card class="mb-3">
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Questions After Completion"
              disabled={!ruleEnabled || !hasCompletion}
              {...control.register(`${namePrefix}.afterComplete.hideQuestions`)}
            />
            {getHideQuestionsText() && (
              <Form.Text class="text-muted d-block mt-1">{getHideQuestionsText()}</Form.Text>
            )}
          </Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.afterComplete.hideQuestionsDateControl.showAgainDateEnabled`}
                      disabled={!ruleEnabled || !hasCompletion || !hideQuestions}
                      disabledReason={
                        !ruleEnabled
                          ? 'Enable this access rule first'
                          : !hasCompletion
                            ? 'Configure completion criteria first'
                            : !hideQuestions
                              ? 'Enable Hide Questions first'
                              : undefined
                      }
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Show Again Date</Form.Label>
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={
                      !ruleEnabled ||
                      !hasCompletion ||
                      !hideQuestions ||
                      !showAgainDateEnabledQuestions
                    }
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
                </Form.Group>
              </Col>
              {showAgainDateEnabledQuestions && showAgainDate && (
                <Col md={6}>
                  <Form.Group>
                    <div class="d-flex align-items-center mb-2">
                      <TriStateCheckbox
                        control={control}
                        name={`${namePrefix}.afterComplete.hideQuestionsDateControl.hideAgainDateEnabled`}
                        disabled={!ruleEnabled || !hasCompletion || !hideQuestions}
                        disabledReason={
                          !ruleEnabled
                            ? 'Enable this access rule first'
                            : !hasCompletion
                              ? 'Configure completion criteria first'
                              : !hideQuestions
                                ? 'Enable Hide Questions first'
                                : undefined
                        }
                        class="me-2"
                      />
                      <Form.Label class="mb-0">Hide Again Date</Form.Label>
                    </div>
                    <Form.Control
                      type="datetime-local"
                      placeholder="Hide Again Date"
                      disabled={
                        !ruleEnabled ||
                        !hasCompletion ||
                        !hideQuestions ||
                        !hideAgainDateEnabledQuestions
                      }
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
                  </Form.Group>
                </Col>
              )}
            </Row>
          </Card.Body>
        </Card>

        {/* Hide Score */}
        <Card>
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Score After Completion"
              disabled={!ruleEnabled || !hasCompletion}
              {...control.register(`${namePrefix}.afterComplete.hideScore`)}
            />
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.afterComplete.hideScoreDateControl.showAgainDateEnabled`}
                      disabled={!ruleEnabled || !hasCompletion || !hideScore}
                      disabledReason={
                        !ruleEnabled
                          ? 'Enable this access rule first'
                          : !hasCompletion
                            ? 'Configure completion criteria first'
                            : !hideScore
                              ? 'Enable Hide Score first'
                              : undefined
                      }
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Show Again Date</Form.Label>
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={
                      !ruleEnabled || !hasCompletion || !hideScore || !showAgainDateEnabledScore
                    }
                    {...control.register(
                      `${namePrefix}.afterComplete.hideScoreDateControl.showAgainDate`,
                    )}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Card.Body>
    </Card>
  );
}
