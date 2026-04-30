import { useEffect } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { get, useController, useFormContext, useFormState, useWatch } from 'react-hook-form';

import { OverlayTrigger, RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { FieldWrapper } from './FieldWrapper.js';
import { useOverrideField } from './hooks/useOverrideField.js';
import {
  type AccessControlFormData,
  type QuestionVisibilityValue,
  type ScoreVisibilityValue,
  isNonDefaultQuestionVisibility,
  isNonDefaultScoreVisibility,
} from './types.js';
import { endOfDayDatetime, startOfDayDatetime, tomorrowDate } from './utils/dateUtils.js';

type HideQuestionsMode =
  | 'show_questions'
  | 'hide_questions_forever'
  | 'hide_questions_until_date'
  | 'hide_questions_between_dates';
type HideScoreMode = 'show_score' | 'hide_score_forever' | 'hide_score_until_date';

const QUESTION_VISIBILITY_ITEMS: RichSelectItem<HideQuestionsMode>[] = [
  {
    value: 'hide_questions_forever',
    label: 'Hide questions permanently',
    description: 'Questions will never be visible after completion',
  },
  {
    value: 'show_questions',
    label: 'Show questions after completion',
    description:
      'Students can see questions and answers immediately after completing the assessment',
  },
  {
    value: 'hide_questions_between_dates',
    label: 'Show questions between dates',
    description: 'Questions will be visible between these dates, hidden before and after',
  },
  {
    value: 'hide_questions_until_date',
    label: 'Show questions after date',
    description: 'Questions will be hidden after completion and become visible on this date',
  },
];

const SCORE_VISIBILITY_ITEMS: RichSelectItem<HideScoreMode>[] = [
  {
    value: 'show_score',
    label: 'Show score after completion',
    description: 'Students can see their score immediately after completing the assessment',
  },
  {
    value: 'hide_score_forever',
    label: 'Hide score permanently',
    description: 'Score will never be visible after completion',
  },
  {
    value: 'hide_score_until_date',
    label: 'Hide score until date',
    description: 'Score will be hidden after completion and become visible again on this date',
  },
];

function getHideQuestionsMode(value: QuestionVisibilityValue): HideQuestionsMode {
  if (!value.hidden) return 'show_questions';
  if (value.visibleFromDate === undefined) return 'hide_questions_forever';
  if (value.visibleUntilDate === undefined) return 'hide_questions_until_date';
  return 'hide_questions_between_dates';
}

function getHideScoreMode(value: ScoreVisibilityValue): HideScoreMode {
  if (!value.hidden) return 'show_score';
  if (value.visibleFromDate === undefined) return 'hide_score_forever';
  return 'hide_score_until_date';
}

const DATE_REQUIRED_MESSAGE = 'Date is required';

const DATE_PICKER_REQUIRED_PX = 320;

function ensureRoomForDatePicker(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  if (window.innerHeight - rect.bottom < DATE_PICKER_REQUIRED_PX) {
    el.scrollIntoView({ block: 'center' });
  }
}

function isDateFieldEmpty(value: string | undefined): boolean {
  return value !== undefined && !value;
}

function validateQuestionVisibility(value: QuestionVisibilityValue): string | true {
  if (!value.hidden) return true;
  if (isDateFieldEmpty(value.visibleFromDate)) return DATE_REQUIRED_MESSAGE;
  if (isDateFieldEmpty(value.visibleUntilDate)) return DATE_REQUIRED_MESSAGE;
  return true;
}

function QuestionVisibilityInput({
  value,
  onChange,
  idPrefix,
  hasPrairieTest = false,
  hasCompletionMechanism = true,
  visibleFromDateError,
  visibleUntilDateError,
  hasCrossFieldError = false,
  displayTimezone,
}: {
  value: QuestionVisibilityValue;
  onChange: (value: QuestionVisibilityValue) => void;
  idPrefix: string;
  hasPrairieTest?: boolean;
  hasCompletionMechanism?: boolean;
  visibleFromDateError?: string;
  visibleUntilDateError?: string;
  hasCrossFieldError?: boolean;
  displayTimezone: string;
}) {
  const hideQuestionsMode = getHideQuestionsMode(value);

  const handleModeChange = (newMode: HideQuestionsMode) => {
    switch (newMode) {
      case 'show_questions':
        onChange({ hidden: false });
        break;
      case 'hide_questions_forever':
        onChange({ hidden: true });
        break;
      case 'hide_questions_between_dates': {
        const tomorrow = tomorrowDate(displayTimezone);
        onChange({
          hidden: true,
          visibleFromDate: startOfDayDatetime(tomorrow),
          visibleUntilDate: endOfDayDatetime(tomorrow.add({ weeks: 2 })),
        });
        break;
      }
      case 'hide_questions_until_date': {
        const tomorrow = tomorrowDate(displayTimezone);
        onChange({ hidden: true, visibleFromDate: startOfDayDatetime(tomorrow) });
        break;
      }
    }
  };

  const visibleFromDateEmpty = isDateFieldEmpty(value.visibleFromDate);
  const visibleFromDateInvalid = visibleFromDateEmpty || !!visibleFromDateError;
  const visibleUntilDateEmpty = isDateFieldEmpty(value.visibleUntilDate);
  const visibleUntilDateInvalid = visibleUntilDateEmpty || !!visibleUntilDateError;

  return (
    <Form.Group>
      <div className="mb-2">
        <RichSelect
          items={QUESTION_VISIBILITY_ITEMS}
          value={hideQuestionsMode}
          aria-label="Question visibility"
          id={`${idPrefix}-question-visibility-mode`}
          minWidth={300}
          isInvalid={hasCrossFieldError}
          onChange={handleModeChange}
        />
      </div>
      {hideQuestionsMode === 'hide_questions_between_dates' && (
        <div className="mt-2">
          <Row className="mb-2 gy-3">
            <Col md={6}>
              <Form.Label htmlFor={`${idPrefix}-show-questions-between-start`}>
                Show questions on
              </Form.Label>
              <Form.Control
                id={`${idPrefix}-show-questions-between-start`}
                type="datetime-local"
                step={1}
                value={value.visibleFromDate ?? ''}
                isInvalid={visibleFromDateInvalid}
                aria-invalid={visibleFromDateInvalid}
                aria-errormessage={
                  visibleFromDateInvalid
                    ? `${idPrefix}-show-questions-between-start-error`
                    : undefined
                }
                onPointerDown={({ currentTarget }) => ensureRoomForDatePicker(currentTarget)}
                onChange={({ currentTarget }) =>
                  onChange({
                    hidden: true,
                    visibleFromDate: currentTarget.value,
                    visibleUntilDate: value.visibleUntilDate,
                  })
                }
              />
              {visibleFromDateInvalid && (
                <Form.Control.Feedback
                  type="invalid"
                  id={`${idPrefix}-show-questions-between-start-error`}
                >
                  {visibleFromDateEmpty ? DATE_REQUIRED_MESSAGE : visibleFromDateError}
                </Form.Control.Feedback>
              )}
            </Col>
            <Col md={6}>
              <Form.Label htmlFor={`${idPrefix}-hide-questions-between-end`}>
                Hide questions again on
              </Form.Label>
              <Form.Control
                id={`${idPrefix}-hide-questions-between-end`}
                type="datetime-local"
                step={1}
                value={value.visibleUntilDate ?? ''}
                isInvalid={visibleUntilDateInvalid}
                aria-invalid={visibleUntilDateInvalid}
                aria-errormessage={
                  visibleUntilDateInvalid
                    ? `${idPrefix}-hide-questions-between-end-error`
                    : undefined
                }
                onPointerDown={({ currentTarget }) => ensureRoomForDatePicker(currentTarget)}
                onChange={({ currentTarget }) =>
                  onChange({
                    hidden: true,
                    visibleFromDate: value.visibleFromDate,
                    visibleUntilDate: currentTarget.value,
                  })
                }
              />
              {visibleUntilDateInvalid && (
                <Form.Control.Feedback
                  type="invalid"
                  id={`${idPrefix}-hide-questions-between-end-error`}
                >
                  {visibleUntilDateEmpty ? DATE_REQUIRED_MESSAGE : visibleUntilDateError}
                </Form.Control.Feedback>
              )}
            </Col>
          </Row>
        </div>
      )}
      {hideQuestionsMode === 'hide_questions_until_date' && (
        <div className="mt-2">
          <Form.Control
            id={`${idPrefix}-show-questions-date`}
            type="datetime-local"
            step={1}
            aria-label="Show questions on"
            value={value.visibleFromDate ?? ''}
            isInvalid={visibleFromDateInvalid}
            aria-invalid={visibleFromDateInvalid}
            aria-errormessage={
              visibleFromDateInvalid ? `${idPrefix}-show-questions-date-error` : undefined
            }
            onPointerDown={({ currentTarget }) => ensureRoomForDatePicker(currentTarget)}
            onChange={({ currentTarget }) =>
              onChange({ hidden: true, visibleFromDate: currentTarget.value })
            }
          />
          {visibleFromDateInvalid && (
            <Form.Control.Feedback type="invalid" id={`${idPrefix}-show-questions-date-error`}>
              {visibleFromDateEmpty ? DATE_REQUIRED_MESSAGE : visibleFromDateError}
            </Form.Control.Feedback>
          )}
        </div>
      )}
      {hasPrairieTest && hideQuestionsMode === 'show_questions' && (
        <Alert variant="warning" className="mt-2 mb-0">
          Showing questions after completion is not recommended when PrairieTest exams are
          connected. Students may be able to view exam content when their assessment is closed.
        </Alert>
      )}
      {!hasPrairieTest && hasCompletionMechanism && hideQuestionsMode !== 'show_questions' && (
        <Alert variant="info" className="mt-2 mb-0">
          If this is not an exam, consider setting question visibility to "Show questions after
          completion" so students can review their work.
        </Alert>
      )}
    </Form.Group>
  );
}

function validateScoreVisibility(value: ScoreVisibilityValue): string | true {
  if (!value.hidden) return true;
  if (isDateFieldEmpty(value.visibleFromDate)) return DATE_REQUIRED_MESSAGE;
  return true;
}

function getScoreCrossFieldError(
  score: ScoreVisibilityValue,
  questions: QuestionVisibilityValue,
): string | undefined {
  if (score.hidden && !questions.hidden) {
    return 'Score cannot be hidden while questions are visible. Choose "Show score after completion" or hide questions too.';
  }
  if (!questions.hidden || questions.visibleFromDate === undefined) return undefined;
  if (!score.hidden) return undefined;
  if (score.visibleFromDate === undefined) {
    return 'Score must become visible by the time questions do. Choose "Show score after completion" or "Hide score until date" with a date on or before the questions show date.';
  }
  if (
    !isDateFieldEmpty(score.visibleFromDate) &&
    !isDateFieldEmpty(questions.visibleFromDate) &&
    new Date(score.visibleFromDate).getTime() > new Date(questions.visibleFromDate).getTime()
  ) {
    return 'Show score date must be on or before the show questions date.';
  }
  return undefined;
}

function ScoreVisibilityInput({
  value,
  onChange,
  idPrefix,
  visibleFromDateError,
  hasCrossFieldError = false,
  displayTimezone,
}: {
  value: ScoreVisibilityValue;
  onChange: (value: ScoreVisibilityValue) => void;
  idPrefix: string;
  visibleFromDateError?: string;
  hasCrossFieldError?: boolean;
  displayTimezone: string;
}) {
  const hideScoreMode = getHideScoreMode(value);

  const handleModeChange = (newMode: HideScoreMode) => {
    switch (newMode) {
      case 'show_score':
        onChange({ hidden: false });
        break;
      case 'hide_score_forever':
        onChange({ hidden: true });
        break;
      case 'hide_score_until_date': {
        const tomorrow = tomorrowDate(displayTimezone);
        onChange({ hidden: true, visibleFromDate: startOfDayDatetime(tomorrow) });
        break;
      }
    }
  };

  const visibleFromDateEmpty = isDateFieldEmpty(value.visibleFromDate);
  const visibleFromDateInvalid =
    visibleFromDateEmpty || !!visibleFromDateError || hasCrossFieldError;

  return (
    <Form.Group>
      <div className="mb-2">
        <RichSelect
          items={SCORE_VISIBILITY_ITEMS}
          value={hideScoreMode}
          aria-label="Score visibility"
          id={`${idPrefix}-score-visibility-mode`}
          minWidth={300}
          isInvalid={hasCrossFieldError}
          onChange={handleModeChange}
        />
      </div>
      {hideScoreMode === 'hide_score_until_date' && (
        <div className="mt-2">
          <Form.Control
            id={`${idPrefix}-show-score-date`}
            type="datetime-local"
            step={1}
            aria-label="Show score again on"
            value={value.visibleFromDate ?? ''}
            isInvalid={visibleFromDateInvalid}
            aria-invalid={visibleFromDateInvalid}
            aria-errormessage={
              visibleFromDateInvalid ? `${idPrefix}-show-score-date-error` : undefined
            }
            onPointerDown={({ currentTarget }) => ensureRoomForDatePicker(currentTarget)}
            onChange={({ currentTarget }) =>
              onChange({ hidden: true, visibleFromDate: currentTarget.value })
            }
          />
          {visibleFromDateInvalid && !hasCrossFieldError && (
            <Form.Control.Feedback type="invalid" id={`${idPrefix}-show-score-date-error`}>
              {visibleFromDateEmpty ? DATE_REQUIRED_MESSAGE : visibleFromDateError}
            </Form.Control.Feedback>
          )}
        </div>
      )}
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
  crossFieldError,
  children,
}: {
  title?: string;
  crossFieldError?: string;
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
      </div>
      {crossFieldError && (
        <div role="alert" className="text-danger small mb-3">
          {crossFieldError}
        </div>
      )}
      <Row className="gy-3">{children}</Row>
    </div>
  );
}

export function MainAfterCompleteForm({
  title,
  displayTimezone,
}: {
  title?: string;
  displayTimezone: string;
}) {
  const { field: qvField } = useController<AccessControlFormData, 'mainRule.questionVisibility'>({
    name: 'mainRule.questionVisibility',
    rules: { validate: validateQuestionVisibility },
  });

  const { field: svField } = useController<AccessControlFormData, 'mainRule.scoreVisibility'>({
    name: 'mainRule.scoreVisibility',
    rules: {
      validate: (value, formValues) => {
        const local = validateScoreVisibility(value);
        if (local !== true) return local;
        return getScoreCrossFieldError(value, formValues.mainRule.questionVisibility) ?? true;
      },
    },
  });

  const { trigger } = useFormContext<AccessControlFormData>();
  useEffect(() => {
    void trigger('mainRule.scoreVisibility');
  }, [qvField.value, trigger]);

  const scoreCrossFieldError = getScoreCrossFieldError(svField.value, qvField.value);

  const { errors } = useFormState<AccessControlFormData>();
  const qvVisibleFromError: string | undefined = get(
    errors,
    'mainRule.questionVisibility.visibleFromDate',
  )?.message;
  const visibleUntilDateError: string | undefined = get(
    errors,
    'mainRule.questionVisibility.visibleUntilDate',
  )?.message;
  const svVisibleFromError: string | undefined = get(
    errors,
    'mainRule.scoreVisibility.visibleFromDate',
  )?.message;

  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  const hasPrairieTest = prairieTestExams.length > 0;

  const due = useWatch<AccessControlFormData, 'mainRule.due'>({
    name: 'mainRule.due',
  });
  const dueDate = due.date;
  const lateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });
  const durationMinutes = useWatch<AccessControlFormData, 'mainRule.durationMinutes'>({
    name: 'mainRule.durationMinutes',
  });
  const hasCompletionMechanism =
    hasPrairieTest || dueDate != null || lateDeadlines.length > 0 || durationMinutes != null;

  const qvNonDefault = isNonDefaultQuestionVisibility(qvField.value);
  const svNonDefault = isNonDefaultScoreVisibility(svField.value);
  const showNoCompletionWarning = !hasCompletionMechanism && (qvNonDefault || svNonDefault);

  return (
    <AfterCompleteCard title={title} crossFieldError={scoreCrossFieldError}>
      {showNoCompletionWarning && (
        <Col xs={12}>
          <Alert variant="warning" className="py-2 mb-0">
            These settings will have no effect because there is no way for the assessment to be
            completed.
          </Alert>
        </Col>
      )}
      <Col md={6}>
        <Form.Label className="fw-bold" htmlFor="mainRule-question-visibility-mode">
          Question visibility
        </Form.Label>
        <QuestionVisibilityInput
          value={qvField.value}
          idPrefix="mainRule"
          hasPrairieTest={hasPrairieTest}
          hasCompletionMechanism={hasCompletionMechanism}
          visibleFromDateError={qvVisibleFromError}
          visibleUntilDateError={visibleUntilDateError}
          hasCrossFieldError={!!scoreCrossFieldError}
          displayTimezone={displayTimezone}
          onChange={qvField.onChange}
        />
      </Col>
      <Col md={6}>
        <Form.Label className="fw-bold" htmlFor="mainRule-score-visibility-mode">
          Score visibility
        </Form.Label>
        <ScoreVisibilityInput
          value={svField.value}
          idPrefix="mainRule"
          visibleFromDateError={svVisibleFromError}
          hasCrossFieldError={!!scoreCrossFieldError}
          displayTimezone={displayTimezone}
          onChange={svField.onChange}
        />
      </Col>
    </AfterCompleteCard>
  );
}

export function OverrideAfterCompleteForm({
  index,
  title,
  displayTimezone,
}: {
  index: number;
  title?: string;
  displayTimezone: string;
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

  const { errors } = useFormState<AccessControlFormData>();
  const qvVisibleFromError: string | undefined = get(
    errors,
    `overrides.${index}.questionVisibility.visibleFromDate`,
  )?.message;
  const visibleUntilDateError: string | undefined = get(
    errors,
    `overrides.${index}.questionVisibility.visibleUntilDate`,
  )?.message;
  const svVisibleFromError: string | undefined = get(
    errors,
    `overrides.${index}.scoreVisibility.visibleFromDate`,
  )?.message;

  const { field: qvField } = useController<
    AccessControlFormData,
    `overrides.${number}.questionVisibility`
  >({
    name: `overrides.${index}.questionVisibility`,
    rules: { validate: validateQuestionVisibility },
  });
  const { field: svField } = useController<
    AccessControlFormData,
    `overrides.${number}.scoreVisibility`
  >({
    name: `overrides.${index}.scoreVisibility`,
    rules: {
      validate: (value, formValues) => {
        const local = validateScoreVisibility(value);
        if (local !== true) return local;
        return (
          getScoreCrossFieldError(value, formValues.overrides[index].questionVisibility) ?? true
        );
      },
    },
  });

  const { trigger } = useFormContext<AccessControlFormData>();
  useEffect(() => {
    void trigger(`overrides.${index}.scoreVisibility`);
  }, [qvField.value, index, trigger]);

  const scoreCrossFieldError = getScoreCrossFieldError(svField.value, qvField.value);

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
    <AfterCompleteCard title={title} crossFieldError={scoreCrossFieldError}>
      <Col md={6}>
        <FieldWrapper
          isOverridden={qvOverridden}
          label="Question visibility"
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
            visibleFromDateError={qvVisibleFromError}
            visibleUntilDateError={visibleUntilDateError}
            hasCrossFieldError={!!scoreCrossFieldError}
            displayTimezone={displayTimezone}
            onChange={qvField.onChange}
          />
        </FieldWrapper>
      </Col>
      <Col md={6}>
        <FieldWrapper
          isOverridden={svOverridden}
          label="Score visibility"
          onOverride={() => {
            svField.onChange({ ...mainSV });
            addSvOverride();
          }}
          onRemoveOverride={removeSvOverride}
        >
          <ScoreVisibilityInput
            value={svField.value}
            idPrefix={`overrides-${index}`}
            visibleFromDateError={svVisibleFromError}
            hasCrossFieldError={!!scoreCrossFieldError}
            displayTimezone={displayTimezone}
            onChange={svField.onChange}
          />
        </FieldWrapper>
      </Col>
    </AfterCompleteCard>
  );
}
