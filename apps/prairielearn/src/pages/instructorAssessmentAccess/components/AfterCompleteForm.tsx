import { Card, Col, Form, OverlayTrigger, Popover, Row } from 'react-bootstrap';
import { type Control, useWatch } from 'react-hook-form';

import { TriStateCheckbox } from './TriStateCheckbox.js';
import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.afterComplete' | `overrides.${number}.afterComplete`;
}

export function AfterCompleteForm({ control, namePrefix }: AfterCompleteFormProps) {
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
    const criteria: string[] = [];

    // Time limit
    if (durationMinutesEnabled && durationMinutes) {
      criteria.push(`• Time limit: ${durationMinutes} minutes after starting`);
    }

    // Deadlines
    if (lateDeadlinesEnabled && lateDeadlines?.length > 0) {
      const validLateDeadlines = lateDeadlines.filter((deadline) => deadline?.date);
      if (validLateDeadlines.length > 0) {
        const sortedLateDeadlines = validLateDeadlines.sort(
          (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime(),
        );
        const latestLateDeadline = sortedLateDeadlines[0];
        if (latestLateDeadline.date) {
          const date = new Date(latestLateDeadline.date);
          criteria.push(
            `• Late deadline: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`,
          );
        }
      }
    } else if (dueDate) {
      const date = new Date(dueDate);
      criteria.push(`• Due date: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`);
    }

    // PrairieTest Control
    if (prairieTestEnabled && prairieTestExams?.length > 0) {
      const validExams = prairieTestExams.filter((exam) => exam?.examUuid);
      if (validExams.length > 0) {
        criteria.push('• PrairieTest: When any of these exams ends:');
        validExams.forEach((exam) => {
          criteria.push(`  • ${exam.examUuid}`);
        });
      }
    }

    if (criteria.length === 0) {
      return 'No specific completion criteria configured. The assessment may complete based on other factors.';
    }

    return criteria.join('\n');
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
                    <div style={{ whiteSpace: 'pre-line' }}>{getCompletionExplanation()}</div>
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
              {...control.register(`${namePrefix}.hideQuestions`)}
            />
          </Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`}
                      disabled={!hideQuestions}
                      disabledReason={!hideQuestions ? 'Enable Hide Questions first' : undefined}
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Show Again Date</Form.Label>
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={!hideQuestions || !showAgainDateEnabledQuestions}
                    {...control.register(`${namePrefix}.hideQuestionsDateControl.showAgainDate`)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <TriStateCheckbox
                      control={control}
                      name={`${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`}
                      disabled={!hideQuestions}
                      disabledReason={!hideQuestions ? 'Enable Hide Questions first' : undefined}
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Hide Again Date</Form.Label>
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Hide Again Date"
                    disabled={!hideQuestions || !hideAgainDateEnabledQuestions}
                    {...control.register(`${namePrefix}.hideQuestionsDateControl.hideAgainDate`)}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Hide Score */}
        <Card>
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Score After Completion"
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
                      disabled={!hideScore}
                      disabledReason={!hideScore ? 'Enable Hide Score first' : undefined}
                      class="me-2"
                    />
                    <Form.Label class="mb-0">Show Again Date</Form.Label>
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={!hideScore || !showAgainDateEnabledScore}
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
