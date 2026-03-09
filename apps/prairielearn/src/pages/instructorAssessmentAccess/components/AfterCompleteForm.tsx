import { Button, Card, Col, Form, Row } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import { FieldWrapper } from './FieldWrapper.js';
import { useOverridableField } from './hooks/useOverridableField.js';
import type { NamePrefix } from './hooks/useTypedFormWatch.js';
import type { QuestionVisibilityValue, ScoreVisibilityValue } from './types.js';

interface AfterCompleteFormProps {
  namePrefix: NamePrefix;
  title?: string;
  description?: string;
}

type HideQuestionsMode =
  | 'show_questions'
  | 'hide_questions_forever'
  | 'hide_questions_until_date'
  | 'hide_questions_between_dates';
type HideScoreMode = 'show_score' | 'hide_score_forever' | 'hide_score_until_date';

export function AfterCompleteForm({
  namePrefix,
  title = 'After completion behavior',
  description = 'Configure what happens after students complete the assessment',
}: AfterCompleteFormProps) {
  const isOverrideRule = namePrefix.startsWith('overrides.');

  const {
    field: questionVisibility,
    setField: setQuestionVisibility,
    enableOverride: enableQuestionOverride,
    removeOverride: removeQuestionOverride,
  } = useOverridableField({
    namePrefix,
    fieldPath: 'afterComplete.questionVisibility',
    defaultValue: { hideQuestions: false } as QuestionVisibilityValue,
  });

  const {
    field: scoreVisibility,
    setField: setScoreVisibility,
    enableOverride: enableScoreOverride,
    removeOverride: removeScoreOverride,
  } = useOverridableField({
    namePrefix,
    fieldPath: 'afterComplete.scoreVisibility',
    defaultValue: { hideScore: false } as ScoreVisibilityValue,
  });

  const getHideQuestionsMode = (): HideQuestionsMode => {
    const value = questionVisibility.value;
    if (!value.hideQuestions) return 'show_questions';
    if (value.showAgainDate === undefined) return 'hide_questions_forever';
    if (value.hideAgainDate === undefined) return 'hide_questions_until_date';
    return 'hide_questions_between_dates';
  };

  const hideQuestionsMode = getHideQuestionsMode();

  const getHideScoreMode = (): HideScoreMode => {
    const value = scoreVisibility.value;
    if (!value.hideScore) return 'show_score';
    if (value.showAgainDate === undefined) return 'hide_score_forever';
    return 'hide_score_until_date';
  };

  const hideScoreMode = getHideScoreMode();

  const infoPopoverConfig = {
    header: 'When is an assessment "complete"?',
    body: (
      <>
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
      </>
    ),
    props: { id: 'after-complete-info-popover' },
  };

  const questionVisibilityContent = (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-hideQuestionsMode`}
          id={`${namePrefix}-show-questions`}
          label="Show questions after completion"
          checked={hideQuestionsMode === 'show_questions'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setQuestionVisibility({ value: { hideQuestions: false } });
            }
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Students can see questions and answers immediately after completing the assessment
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${namePrefix}-hideQuestionsMode`}
          id={`${namePrefix}-hide-questions-forever`}
          label="Hide questions permanently"
          checked={hideQuestionsMode === 'hide_questions_forever'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setQuestionVisibility({ value: { hideQuestions: true } });
            }
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Questions will never be visible after completion
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${namePrefix}-hideQuestionsMode`}
          id={`${namePrefix}-hide-questions-until-date`}
          label="Hide questions until date"
          checked={hideQuestionsMode === 'hide_questions_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setQuestionVisibility({ value: { hideQuestions: true, showAgainDate: '' } });
            }
          }}
        />
        {hideQuestionsMode === 'hide_questions_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Label htmlFor={`${namePrefix}-show-questions-date`}>
              Show questions again on:
            </Form.Label>
            <Form.Control
              id={`${namePrefix}-show-questions-date`}
              type="datetime-local"
              aria-describedby={`${namePrefix}-show-questions-date-help`}
              value={questionVisibility.value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                setQuestionVisibility({
                  value: {
                    hideQuestions: true,
                    showAgainDate: currentTarget.value,
                  },
                })
              }
            />
            <Form.Text id={`${namePrefix}-show-questions-date-help`} className="text-muted">
              Questions will be hidden after completion and become visible again on this date
            </Form.Text>
          </div>
        )}

        <Form.Check
          type="radio"
          name={`${namePrefix}-hideQuestionsMode`}
          id={`${namePrefix}-hide-questions-between-dates`}
          label="Hide questions between dates"
          checked={hideQuestionsMode === 'hide_questions_between_dates'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setQuestionVisibility({
                value: { hideQuestions: true, showAgainDate: '', hideAgainDate: '' },
              });
            }
          }}
        />
        {hideQuestionsMode === 'hide_questions_between_dates' && (
          <div className="ms-4 mt-2">
            <Row className="mb-2">
              <Col md={6}>
                <Form.Label htmlFor={`${namePrefix}-show-questions-between-start`}>
                  Show questions again on:
                </Form.Label>
                <Form.Control
                  id={`${namePrefix}-show-questions-between-start`}
                  type="datetime-local"
                  value={questionVisibility.value.showAgainDate ?? ''}
                  onChange={({ currentTarget }) =>
                    setQuestionVisibility({
                      value: {
                        hideQuestions: true,
                        showAgainDate: currentTarget.value,
                        hideAgainDate: questionVisibility.value.hideAgainDate,
                      },
                    })
                  }
                />
              </Col>
              <Col md={6}>
                <Form.Label htmlFor={`${namePrefix}-hide-questions-between-end`}>
                  Hide questions again on:
                </Form.Label>
                <Form.Control
                  id={`${namePrefix}-hide-questions-between-end`}
                  type="datetime-local"
                  value={questionVisibility.value.hideAgainDate ?? ''}
                  onChange={({ currentTarget }) =>
                    setQuestionVisibility({
                      value: {
                        hideQuestions: true,
                        showAgainDate: questionVisibility.value.showAgainDate,
                        hideAgainDate: currentTarget.value,
                      },
                    })
                  }
                />
              </Col>
            </Row>
            <Form.Text className="text-muted">
              Questions will be visible between these dates, hidden before and after
            </Form.Text>
          </div>
        )}
      </div>
    </Form.Group>
  );

  const scoreVisibilityContent = (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-hideScoreMode`}
          id={`${namePrefix}-show-score`}
          label="Show score after completion"
          checked={hideScoreMode === 'show_score'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setScoreVisibility({ value: { hideScore: false } });
            }
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Students can see their score immediately after completing the assessment
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${namePrefix}-hideScoreMode`}
          id={`${namePrefix}-hide-score-forever`}
          label="Hide score permanently"
          checked={hideScoreMode === 'hide_score_forever'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setScoreVisibility({ value: { hideScore: true } });
            }
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Score will never be visible after completion
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${namePrefix}-hideScoreMode`}
          id={`${namePrefix}-hide-score-until-date`}
          label="Hide score until date"
          checked={hideScoreMode === 'hide_score_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setScoreVisibility({ value: { hideScore: true, showAgainDate: '' } });
            }
          }}
        />
        {hideScoreMode === 'hide_score_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Label htmlFor={`${namePrefix}-show-score-date`}>Show score again on:</Form.Label>
            <Form.Control
              id={`${namePrefix}-show-score-date`}
              type="datetime-local"
              aria-describedby={`${namePrefix}-show-score-date-help`}
              value={scoreVisibility.value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                setScoreVisibility({
                  value: {
                    hideScore: true,
                    showAgainDate: currentTarget.value,
                  },
                })
              }
            />
            <Form.Text id={`${namePrefix}-show-score-date-help`} className="text-muted">
              Score will be hidden after completion and become visible again on this date
            </Form.Text>
          </div>
        )}
      </div>
    </Form.Group>
  );

  return (
    <Card className="mb-4">
      <Card.Header>
        <div>
          <div className="d-flex align-items-center">
            <span>{title}</span>
            <OverlayTrigger trigger="click" placement="right" popover={infoPopoverConfig}>
              <Button
                variant="link"
                size="sm"
                className="ms-2 p-0"
                aria-label="When is an assessment complete?"
              >
                <i className="bi bi-info-circle" aria-hidden="true" />
              </Button>
            </OverlayTrigger>
          </div>
          <Form.Text className="text-muted">{description}</Form.Text>
        </div>
      </Card.Header>
      <Card.Body>
        <Row>
          <Col md={6}>
            <FieldWrapper
              isOverrideRule={isOverrideRule}
              isOverridden={questionVisibility.isOverridden}
              label="Question visibility"
              headerContent={<strong>Question visibility</strong>}
              onOverride={() => enableQuestionOverride({ hideQuestions: false })}
              onRemoveOverride={removeQuestionOverride}
            >
              {questionVisibilityContent}
            </FieldWrapper>
          </Col>
          <Col md={6}>
            <FieldWrapper
              isOverrideRule={isOverrideRule}
              isOverridden={scoreVisibility.isOverridden}
              label="Score visibility"
              headerContent={<strong>Score visibility</strong>}
              onOverride={() => enableScoreOverride({ hideScore: false })}
              onRemoveOverride={removeScoreOverride}
            >
              {scoreVisibilityContent}
            </FieldWrapper>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
