import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import { FieldWrapper } from './FieldWrapper.js';
import type {
  AccessControlFormData,
  QuestionVisibilityValue,
  ScoreVisibilityValue,
} from './types.js';

type HideQuestionsMode =
  | 'show_questions'
  | 'hide_questions_forever'
  | 'hide_questions_until_date'
  | 'hide_questions_between_dates';
type HideScoreMode = 'show_score' | 'hide_score_forever' | 'hide_score_until_date';

function getHideQuestionsMode(value: QuestionVisibilityValue): HideQuestionsMode {
  if (!value.hideQuestions) return 'show_questions';
  if (value.showAgainDate === undefined) return 'hide_questions_forever';
  if (value.hideAgainDate === undefined) return 'hide_questions_until_date';
  return 'hide_questions_between_dates';
}

function getHideScoreMode(value: ScoreVisibilityValue): HideScoreMode {
  if (!value.hideScore) return 'show_score';
  if (value.showAgainDate === undefined) return 'hide_score_forever';
  return 'hide_score_until_date';
}

function formatQuestionVisibility(value: QuestionVisibilityValue): string {
  const mode = getHideQuestionsMode(value);
  switch (mode) {
    case 'show_questions':
      return 'Show questions';
    case 'hide_questions_forever':
      return 'Hide questions permanently';
    case 'hide_questions_until_date':
      return `Hide questions until ${value.showAgainDate || 'date'}`;
    case 'hide_questions_between_dates':
      return 'Hide questions between dates';
  }
}

function formatScoreVisibility(value: ScoreVisibilityValue): string {
  const mode = getHideScoreMode(value);
  switch (mode) {
    case 'show_score':
      return 'Show score';
    case 'hide_score_forever':
      return 'Hide score permanently';
    case 'hide_score_until_date':
      return `Hide score until ${value.showAgainDate || 'date'}`;
  }
}

interface QuestionVisibilityInputProps {
  value: QuestionVisibilityValue;
  onChange: (value: QuestionVisibilityValue) => void;
  idPrefix: string;
}

function QuestionVisibilityInput({ value, onChange, idPrefix }: QuestionVisibilityInputProps) {
  const hideQuestionsMode = getHideQuestionsMode(value);

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-show-questions`}
          label="Show questions after completion"
          checked={hideQuestionsMode === 'show_questions'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideQuestions: false });
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Students can see questions and answers immediately after completing the assessment
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-hide-questions-forever`}
          label="Hide questions permanently"
          checked={hideQuestionsMode === 'hide_questions_forever'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideQuestions: true });
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Questions will never be visible after completion
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-hide-questions-until-date`}
          label="Hide questions until date"
          checked={hideQuestionsMode === 'hide_questions_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideQuestions: true, showAgainDate: '' });
          }}
        />
        {hideQuestionsMode === 'hide_questions_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Label htmlFor={`${idPrefix}-show-questions-date`}>
              Show questions again on:
            </Form.Label>
            <Form.Control
              id={`${idPrefix}-show-questions-date`}
              type="datetime-local"
              aria-describedby={`${idPrefix}-show-questions-date-help`}
              value={value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                onChange({ hideQuestions: true, showAgainDate: currentTarget.value })
              }
            />
            <Form.Text id={`${idPrefix}-show-questions-date-help`} className="text-muted">
              Questions will be hidden after completion and become visible again on this date
            </Form.Text>
          </div>
        )}

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-hide-questions-between-dates`}
          label="Hide questions between dates"
          checked={hideQuestionsMode === 'hide_questions_between_dates'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChange({ hideQuestions: true, showAgainDate: '', hideAgainDate: '' });
            }
          }}
        />
        {hideQuestionsMode === 'hide_questions_between_dates' && (
          <div className="ms-4 mt-2">
            <Row className="mb-2">
              <Col md={6}>
                <Form.Label htmlFor={`${idPrefix}-show-questions-between-start`}>
                  Show questions again on:
                </Form.Label>
                <Form.Control
                  id={`${idPrefix}-show-questions-between-start`}
                  type="datetime-local"
                  value={value.showAgainDate ?? ''}
                  onChange={({ currentTarget }) =>
                    onChange({
                      hideQuestions: true,
                      showAgainDate: currentTarget.value,
                      hideAgainDate: value.hideAgainDate,
                    })
                  }
                />
              </Col>
              <Col md={6}>
                <Form.Label htmlFor={`${idPrefix}-hide-questions-between-end`}>
                  Hide questions again on:
                </Form.Label>
                <Form.Control
                  id={`${idPrefix}-hide-questions-between-end`}
                  type="datetime-local"
                  value={value.hideAgainDate ?? ''}
                  onChange={({ currentTarget }) =>
                    onChange({
                      hideQuestions: true,
                      showAgainDate: value.showAgainDate,
                      hideAgainDate: currentTarget.value,
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
}

interface ScoreVisibilityInputProps {
  value: ScoreVisibilityValue;
  onChange: (value: ScoreVisibilityValue) => void;
  idPrefix: string;
}

function ScoreVisibilityInput({ value, onChange, idPrefix }: ScoreVisibilityInputProps) {
  const hideScoreMode = getHideScoreMode(value);

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-hideScoreMode`}
          id={`${idPrefix}-show-score`}
          label="Show score after completion"
          checked={hideScoreMode === 'show_score'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideScore: false });
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Students can see their score immediately after completing the assessment
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideScoreMode`}
          id={`${idPrefix}-hide-score-forever`}
          label="Hide score permanently"
          checked={hideScoreMode === 'hide_score_forever'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideScore: true });
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          Score will never be visible after completion
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideScoreMode`}
          id={`${idPrefix}-hide-score-until-date`}
          label="Hide score until date"
          checked={hideScoreMode === 'hide_score_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ hideScore: true, showAgainDate: '' });
          }}
        />
        {hideScoreMode === 'hide_score_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Label htmlFor={`${idPrefix}-show-score-date`}>Show score again on:</Form.Label>
            <Form.Control
              id={`${idPrefix}-show-score-date`}
              type="datetime-local"
              aria-describedby={`${idPrefix}-show-score-date-help`}
              value={value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                onChange({ hideScore: true, showAgainDate: currentTarget.value })
              }
            />
            <Form.Text id={`${idPrefix}-show-score-date-help`} className="text-muted">
              Score will be hidden after completion and become visible again on this date
            </Form.Text>
          </div>
        )}
      </div>
    </Form.Group>
  );
}

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

interface AfterCompleteCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

function AfterCompleteCard({
  title = 'After completion behavior',
  description = 'Configure what happens after students complete the assessment',
  children,
}: AfterCompleteCardProps) {
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
        <Row>{children}</Row>
      </Card.Body>
    </Card>
  );
}

export function MainAfterCompleteForm({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const { field: qvField } = useController<AccessControlFormData, 'mainRule.questionVisibility'>({
    name: 'mainRule.questionVisibility',
  });

  const { field: svField } = useController<AccessControlFormData, 'mainRule.scoreVisibility'>({
    name: 'mainRule.scoreVisibility',
  });

  return (
    <AfterCompleteCard title={title} description={description}>
      <Col md={6}>
        <div className="mb-3">
          <strong>Question visibility</strong>
          <QuestionVisibilityInput
            value={qvField.value}
            idPrefix="mainRule"
            onChange={qvField.onChange}
          />
        </div>
      </Col>
      <Col md={6}>
        <div className="mb-3">
          <strong>Score visibility</strong>
          <ScoreVisibilityInput
            value={svField.value}
            idPrefix="mainRule"
            onChange={svField.onChange}
          />
        </div>
      </Col>
    </AfterCompleteCard>
  );
}

export function OverrideAfterCompleteForm({
  index,
  title,
  description,
}: {
  index: number;
  title?: string;
  description?: string;
}) {
  const mainQV = useWatch<AccessControlFormData, 'mainRule.questionVisibility'>({
    name: 'mainRule.questionVisibility',
  });
  const mainSV = useWatch<AccessControlFormData, 'mainRule.scoreVisibility'>({
    name: 'mainRule.scoreVisibility',
  });

  const { field: qvField } = useController({
    name: `overrides.${index}.questionVisibility` as Path<AccessControlFormData>,
  });
  const { field: svField } = useController({
    name: `overrides.${index}.scoreVisibility` as Path<AccessControlFormData>,
  });

  const qvValue = qvField.value as QuestionVisibilityValue | undefined;
  const svValue = svField.value as ScoreVisibilityValue | undefined;

  const qvOverridden = qvValue !== undefined;
  const svOverridden = svValue !== undefined;

  return (
    <AfterCompleteCard title={title} description={description}>
      <Col md={6}>
        <FieldWrapper
          isOverridden={qvOverridden}
          label="Question visibility"
          inheritedValue={formatQuestionVisibility(mainQV)}
          headerContent={<strong>Question visibility</strong>}
          onOverride={() => qvField.onChange({ ...mainQV })}
          onRemoveOverride={() => qvField.onChange(undefined)}
        >
          <QuestionVisibilityInput
            value={qvValue!}
            idPrefix={`overrides-${index}`}
            onChange={qvField.onChange}
          />
        </FieldWrapper>
      </Col>
      <Col md={6}>
        <FieldWrapper
          isOverridden={svOverridden}
          label="Score visibility"
          inheritedValue={formatScoreVisibility(mainSV)}
          headerContent={<strong>Score visibility</strong>}
          onOverride={() => svField.onChange({ ...mainSV })}
          onRemoveOverride={() => svField.onChange(undefined)}
        >
          <ScoreVisibilityInput
            value={svValue!}
            idPrefix={`overrides-${index}`}
            onChange={svField.onChange}
          />
        </FieldWrapper>
      </Col>
    </AfterCompleteCard>
  );
}
