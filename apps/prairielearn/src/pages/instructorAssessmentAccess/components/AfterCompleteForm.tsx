import { Card, Col, Form, OverlayTrigger, Popover, Row } from 'react-bootstrap';
import { type Control, useWatch } from 'react-hook-form';

import { TriStateCheckbox } from './TriStateCheckbox.js';
import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.afterComplete' | `overrides.${number}.afterComplete`;
  ruleEnabled?: boolean;
}

export function AfterCompleteForm({
  control,
  namePrefix,
  ruleEnabled = true,
}: AfterCompleteFormProps) {
  // Get the base path for accessing date control and prairie test control
  const basePath = namePrefix.replace('.afterComplete', '');

  const hideQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestions`,
  });

  const hideScore = useWatch({
    control,
    name: `${namePrefix}.hideScore`,
  });

  const showAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`,
  });

  const hideAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`,
  });

  const showAgainDateEnabledScore = useWatch({
    control,
    name: `${namePrefix}.hideScoreDateControl.showAgainDateEnabled`,
  });

  // Watch date values for validation
  const showAgainDate = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.showAgainDate`,
  });

  const hideAgainDate = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.hideAgainDate`,
  });

  // Watch completion criteria
  const durationMinutesEnabled = useWatch({
    control,
    name: `${basePath}.dateControl.durationMinutesEnabled` as any,
  });

  const durationMinutes = useWatch({
    control,
    name: `${basePath}.dateControl.durationMinutes` as any,
  });

  const dueDate = useWatch({
    control,
    name: `${basePath}.dateControl.dueDate` as any,
  });

  const dueDateEnabled = useWatch({
    control,
    name: `${basePath}.dateControl.dueDateEnabled` as any,
  });

  const lateDeadlines = useWatch({
    control,
    name: `${basePath}.dateControl.lateDeadlines` as any,
    defaultValue: [],
  }) as { date?: string; credit?: number }[];

  const lateDeadlinesEnabled = useWatch({
    control,
    name: `${basePath}.dateControl.lateDeadlinesEnabled` as any,
  });

  const prairieTestEnabled = useWatch({
    control,
    name: `${basePath}.prairieTestControl.enabled` as any,
  });

  const prairieTestExams = useWatch({
    control,
    name: `${basePath}.prairieTestControl.exams` as any,
    defaultValue: [],
  }) as { examUuid?: string; readOnly?: boolean }[];

  // Generate completion explanation
  const getCompletionExplanation = () => {
    const criteria: (string | string[])[] = [];

    // Time limit
    if (durationMinutesEnabled && durationMinutes) {
      criteria.push(`${durationMinutes} minutes after starting`);
    }

    // Deadlines
    if (lateDeadlinesEnabled && dueDateEnabled && dueDate && lateDeadlines?.length > 0) {
      const validLateDeadlines = lateDeadlines.filter((deadline) => deadline?.date);
      if (validLateDeadlines.length > 0) {
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime(),
        );
        const latestLateDeadline = sortedLateDeadlines[0];
        if (latestLateDeadline.date) {
          const date = new Date(latestLateDeadline.date);
          criteria.push(`${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
        }
      }
    } else if (dueDateEnabled && dueDate) {
      const date = new Date(dueDate);
      criteria.push(`${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
    }

    // PrairieTest Control
    if (prairieTestEnabled && prairieTestExams?.length > 0) {
      const validExams = prairieTestExams.filter((exam) => exam?.examUuid);
      const subList = validExams.map((exam) => exam.examUuid!);
      criteria.push('When any of these exams ends:', subList);
    }

    if (criteria.length === 0) {
      return 'No specific completion criteria configured. The assessment may complete based on other factors.';
    }

    return (
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
  };

  // Check if there are completion criteria by getting the explanation and checking if it has criteria
  const completionExplanation = getCompletionExplanation();
  const hasCompletion =
    completionExplanation !==
    'No specific completion criteria configured. The assessment may complete based on other factors.';

  // Helper function to get the last deadline for validation
  const getLastDeadlineDate = (): string | null => {
    // Check late deadlines first
    if (lateDeadlinesEnabled && dueDateEnabled && dueDate && lateDeadlines?.length > 0) {
      const validLateDeadlines = lateDeadlines.filter((deadline) => deadline?.date);
      if (validLateDeadlines.length > 0) {
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime(),
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
      {!hasCompletion && (
        <div class="alert alert-warning mb-0 border-start-0 border-end-0 border-top-0 rounded-0">
          <i class="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
          <strong>No completion criteria configured.</strong> Students will not be able to complete
          this assessment because no time limit, deadlines, or PrairieTest exams are configured.
        </div>
      )}
      <Card.Body>
        {/* Hide Questions */}
        <Card class="mb-3">
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Questions After Completion"
              disabled={!ruleEnabled || !hasCompletion}
              {...control.register(`${namePrefix}.hideQuestions`)}
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
                      name={`${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`}
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
                    {...control.register(`${namePrefix}.hideQuestionsDateControl.showAgainDate`, {
                      validate: (value) => {
                        if (!value) return true;
                        const lastDeadline = getLastDeadlineDate();
                        if (lastDeadline) {
                          const showDate = new Date(value);
                          const lastDate = new Date(lastDeadline);
                          return (
                            showDate > lastDate || 'Show Again Date must be after the last deadline'
                          );
                        }
                        return true;
                      },
                    })}
                  />
                </Form.Group>
              </Col>
              {showAgainDateEnabledQuestions && showAgainDate && (
                <Col md={6}>
                  <Form.Group>
                    <div class="d-flex align-items-center mb-2">
                      <TriStateCheckbox
                        control={control}
                        name={`${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`}
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
                      {...control.register(`${namePrefix}.hideQuestionsDateControl.hideAgainDate`, {
                        validate: (value) => {
                          if (!value || !showAgainDate) return true;
                          const hideDate = new Date(value);
                          const showDate = new Date(showAgainDate);
                          return (
                            hideDate > showDate ||
                            'Hide Again Date must be after the Show Again Date'
                          );
                        },
                      })}
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
              {...control.register(`${namePrefix}.hideScore`)}
            />
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.hideScoreDateControl.showAgainDateEnabled`}
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
                    {...control.register(`${namePrefix}.hideScoreDateControl.showAgainDate`)}
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
