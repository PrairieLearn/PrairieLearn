import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import { FieldWrapper } from './FieldWrapper.js';
import { useOverrideField } from './hooks/useOverrideField.js';
import type {
  AccessControlFormData,
  QuestionVisibilityValue,
  ScoreVisibilityValue,
} from './types.js';
import { endOfDayDatetime, startOfDayDatetime, tomorrowDate } from './utils/dateUtils.js';

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

function QuestionVisibilityInput({
  value,
  onChange,
  idPrefix,
  hasPrairieTest = false,
}: {
  value: QuestionVisibilityValue;
  onChange: (value: QuestionVisibilityValue) => void;
  idPrefix: string;
  hasPrairieTest?: boolean;
}) {
  const hideQuestionsMode = getHideQuestionsMode(value);

  return (
    <Form.Group>
      <div className="mb-2">
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
        {hideQuestionsMode === 'hide_questions_forever' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Questions will never be visible after completion
          </Form.Text>
        )}

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
        {hideQuestionsMode === 'show_questions' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Students can see questions and answers immediately after completing the assessment
          </Form.Text>
        )}

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-hide-questions-between-dates`}
          label="Show questions between dates"
          checked={hideQuestionsMode === 'hide_questions_between_dates'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              const tomorrow = tomorrowDate();
              onChange({
                hideQuestions: true,
                showAgainDate: startOfDayDatetime(tomorrow),
                hideAgainDate: endOfDayDatetime(tomorrow.add({ weeks: 2 })),
              });
            }
          }}
        />
        {hideQuestionsMode === 'hide_questions_between_dates' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Questions will be visible between these dates, hidden before and after
          </Form.Text>
        )}
        {hideQuestionsMode === 'hide_questions_between_dates' && (
          <div className="ms-4 mt-2">
            <Row className="mb-2 gy-3">
              <Col md={6}>
                <Form.Label htmlFor={`${idPrefix}-show-questions-between-start`}>
                  Show questions on
                </Form.Label>
                <Form.Control
                  id={`${idPrefix}-show-questions-between-start`}
                  type="datetime-local"
                  step={1}
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
                  Hide questions again on
                </Form.Label>
                <Form.Control
                  id={`${idPrefix}-hide-questions-between-end`}
                  type="datetime-local"
                  step={1}
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
          </div>
        )}

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideQuestionsMode`}
          id={`${idPrefix}-hide-questions-until-date`}
          label="Show questions after date"
          checked={hideQuestionsMode === 'hide_questions_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              const tomorrow = tomorrowDate();
              onChange({ hideQuestions: true, showAgainDate: startOfDayDatetime(tomorrow) });
            }
          }}
        />
        {hideQuestionsMode === 'hide_questions_until_date' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Questions will be hidden after completion and become visible on this date
          </Form.Text>
        )}
        {hideQuestionsMode === 'hide_questions_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Control
              id={`${idPrefix}-show-questions-date`}
              type="datetime-local"
              step={1}
              aria-label="Show questions on"
              value={value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                onChange({ hideQuestions: true, showAgainDate: currentTarget.value })
              }
            />
          </div>
        )}
      </div>
      {hasPrairieTest && hideQuestionsMode === 'show_questions' && (
        <Alert variant="warning" className="mb-0">
          Showing questions after completion is not recommended when PrairieTest exams are
          connected. Students may be able to view exam content when their assessment is closed.
        </Alert>
      )}
    </Form.Group>
  );
}

function ScoreVisibilityInput({
  value,
  onChange,
  idPrefix,
}: {
  value: ScoreVisibilityValue;
  onChange: (value: ScoreVisibilityValue) => void;
  idPrefix: string;
}) {
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
        {hideScoreMode === 'show_score' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Students can see their score immediately after completing the assessment
          </Form.Text>
        )}

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
        {hideScoreMode === 'hide_score_forever' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Score will never be visible after completion
          </Form.Text>
        )}

        <Form.Check
          type="radio"
          name={`${idPrefix}-hideScoreMode`}
          id={`${idPrefix}-hide-score-until-date`}
          label="Hide score until date"
          checked={hideScoreMode === 'hide_score_until_date'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              const tomorrow = tomorrowDate();
              onChange({ hideScore: true, showAgainDate: startOfDayDatetime(tomorrow) });
            }
          }}
        />
        {hideScoreMode === 'hide_score_until_date' && (
          <Form.Text className="text-muted ms-4 mb-1 d-block">
            Score will be hidden after completion and become visible again on this date
          </Form.Text>
        )}
        {hideScoreMode === 'hide_score_until_date' && (
          <div className="ms-4 mt-2">
            <Form.Control
              id={`${idPrefix}-show-score-date`}
              type="datetime-local"
              step={1}
              aria-label="Show score again on"
              value={value.showAgainDate ?? ''}
              onChange={({ currentTarget }) =>
                onChange({ hideScore: true, showAgainDate: currentTarget.value })
              }
            />
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
        <li>The last late deadline passes (or due date if no late deadlines)</li>
        <li>
          The assessment is closed (e.g., time limit expires, autoclose, or instructor closes it)
        </li>
      </ul>
      <p>
        The completion date can be different for different students based on when they started or
        their specific accommodations.
      </p>
    </>
  ),
  props: { id: 'after-complete-info-popover' },
};

function AfterCompleteCard({
  title = 'After completion',
  description = 'Configure what happens after students complete the assessment',
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="section-header mb-3">
        <div className="d-flex align-items-center">
          <strong>{title}</strong>
          <OverlayTrigger trigger="click" placement="auto" popover={infoPopoverConfig}>
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
      <Row className="gy-3">{children}</Row>
    </div>
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

  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  const hasPrairieTest = prairieTestExams.length > 0;

  return (
    <AfterCompleteCard title={title} description={description}>
      <Col md={6}>
        <div className="mb-3">
          <strong>Question visibility</strong>
          <QuestionVisibilityInput
            value={qvField.value}
            idPrefix="mainRule"
            hasPrairieTest={hasPrairieTest}
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
  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  const hasPrairieTest = prairieTestExams.length > 0;

  const { field: qvField } = useController<
    AccessControlFormData,
    `overrides.${number}.questionVisibility`
  >({
    name: `overrides.${index}.questionVisibility`,
  });
  const { field: svField } = useController<
    AccessControlFormData,
    `overrides.${number}.scoreVisibility`
  >({
    name: `overrides.${index}.scoreVisibility`,
  });

  const {
    isOverridden: qvOverridden,
    addOverride: addQvOverride,
    removeOverride: removeQvOverride,
  } = useOverrideField(index, 'questionVisibility');
  const {
    isOverridden: svOverridden,
    addOverride: addSvOverride,
    removeOverride: removeSvOverride,
  } = useOverrideField(index, 'scoreVisibility');

  return (
    <AfterCompleteCard title={title} description={description}>
      <Col md={6}>
        <FieldWrapper
          isOverridden={qvOverridden}
          label="Question visibility"
          headerContent={<strong>Question visibility</strong>}
          onOverride={() => {
            qvField.onChange({ ...mainQV });
            addQvOverride();
          }}
          onRemoveOverride={removeQvOverride}
        >
          <QuestionVisibilityInput
            value={qvField.value}
            idPrefix={`overrides-${index}`}
            hasPrairieTest={hasPrairieTest}
            onChange={qvField.onChange}
          />
        </FieldWrapper>
      </Col>
      <Col md={6}>
        <FieldWrapper
          isOverridden={svOverridden}
          label="Score visibility"
          headerContent={<strong>Score visibility</strong>}
          onOverride={() => {
            svField.onChange({ ...mainSV });
            addSvOverride();
          }}
          onRemoveOverride={removeSvOverride}
        >
          <ScoreVisibilityInput
            value={svField.value}
            idPrefix={`overrides-${index}`}
            onChange={svField.onChange}
          />
        </FieldWrapper>
      </Col>
    </AfterCompleteCard>
  );
}
