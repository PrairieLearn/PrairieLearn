import { Alert, Button, Form } from 'react-bootstrap';
import { get, useController, useFormContext, useFormState, useWatch } from 'react-hook-form';

import { OverlayTrigger, RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { useAccessControlRuleEditable } from './AccessControlEditabilityContext.js';
import { FieldWrapper } from './FieldWrapper.js';
import { useOverrideField } from './hooks/useOverrideField.js';
import {
  type AccessControlFormData,
  type QuestionVisibilityValue,
  type ScoreVisibilityValue,
  defaultRuleHasCompletionMechanism,
} from './types.js';
import { endOfDayDatetime, startOfDayDatetime, tomorrowDate } from './utils/dateUtils.js';
import { DATE_REQUIRED_MESSAGE, isDateFieldEmpty } from './validation.js';

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
    value: 'hide_score_forever',
    label: 'Hide score permanently',
    description: 'Score will never be visible after completion',
  },
  {
    value: 'show_score',
    label: 'Show score after completion',
    description: 'Students can see their score immediately after completing the assessment',
  },
  {
    value: 'hide_score_until_date',
    label: 'Show score after date',
    description: 'Score will be hidden after completion and become visible on this date',
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

function QuestionVisibilityInput({
  value,
  onChange,
  idPrefix,
  hasPrairieTest = false,
  hasCompletionMechanism = true,
  visibleFromDateError,
  visibleUntilDateError,
  displayTimezone,
}: {
  value: QuestionVisibilityValue;
  onChange: (value: QuestionVisibilityValue) => void;
  idPrefix: string;
  hasPrairieTest?: boolean;
  hasCompletionMechanism?: boolean;
  visibleFromDateError?: string;
  visibleUntilDateError?: string;
  displayTimezone: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const hideQuestionsMode = getHideQuestionsMode(value);
  const selectedDescription = QUESTION_VISIBILITY_ITEMS.find(
    (item) => item.value === hideQuestionsMode,
  )?.description;

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
    <Form.Group className="d-flex flex-column gap-3">
      <div>
        <RichSelect
          items={QUESTION_VISIBILITY_ITEMS}
          value={hideQuestionsMode}
          aria-label="Question visibility"
          id={`${idPrefix}-question-visibility-mode`}
          minWidth={300}
          disabled={!ruleEditable}
          onChange={handleModeChange}
        />
        {selectedDescription && (
          <Form.Text className="text-muted d-block">{selectedDescription}</Form.Text>
        )}
      </div>
      {hideQuestionsMode === 'hide_questions_between_dates' && (
        <div className="d-flex flex-column gap-3">
          <div>
            <Form.Label htmlFor={`${idPrefix}-show-questions-between-start`}>
              Show questions on
            </Form.Label>
            <Form.Control
              id={`${idPrefix}-show-questions-between-start`}
              type="datetime-local"
              step={1}
              value={value.visibleFromDate ?? ''}
              isInvalid={visibleFromDateInvalid}
              disabled={!ruleEditable}
              aria-invalid={visibleFromDateInvalid}
              aria-errormessage={
                visibleFromDateInvalid
                  ? `${idPrefix}-show-questions-between-start-error`
                  : undefined
              }
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
          </div>
          <div>
            <Form.Label htmlFor={`${idPrefix}-hide-questions-between-end`}>
              Hide questions again on
            </Form.Label>
            <Form.Control
              id={`${idPrefix}-hide-questions-between-end`}
              type="datetime-local"
              step={1}
              value={value.visibleUntilDate ?? ''}
              isInvalid={visibleUntilDateInvalid}
              disabled={!ruleEditable}
              aria-invalid={visibleUntilDateInvalid}
              aria-errormessage={
                visibleUntilDateInvalid ? `${idPrefix}-hide-questions-between-end-error` : undefined
              }
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
          </div>
        </div>
      )}
      {hideQuestionsMode === 'hide_questions_until_date' && (
        <div>
          <Form.Control
            id={`${idPrefix}-show-questions-date`}
            type="datetime-local"
            step={1}
            aria-label="Show questions on"
            value={value.visibleFromDate ?? ''}
            isInvalid={visibleFromDateInvalid}
            disabled={!ruleEditable}
            aria-invalid={visibleFromDateInvalid}
            aria-errormessage={
              visibleFromDateInvalid ? `${idPrefix}-show-questions-date-error` : undefined
            }
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
        <Alert variant="warning" className="mb-0">
          Showing questions after completion is not recommended when PrairieTest exams are
          connected. Students may be able to view exam content when their assessment is closed.
        </Alert>
      )}
      {!hasPrairieTest && hasCompletionMechanism && hideQuestionsMode !== 'show_questions' && (
        <Alert variant="info" className="mb-0">
          If this is not an exam, consider setting question visibility to "Show questions after
          completion" so students can review their work.
        </Alert>
      )}
    </Form.Group>
  );
}

function ScoreVisibilityInput({
  value,
  onChange,
  idPrefix,
  visibleFromDateError,
  displayTimezone,
}: {
  value: ScoreVisibilityValue;
  onChange: (value: ScoreVisibilityValue) => void;
  idPrefix: string;
  visibleFromDateError?: string;
  displayTimezone: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const hideScoreMode = getHideScoreMode(value);
  const selectedDescription = SCORE_VISIBILITY_ITEMS.find(
    (item) => item.value === hideScoreMode,
  )?.description;

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
  const visibleFromDateInvalid = visibleFromDateEmpty || !!visibleFromDateError;

  return (
    <Form.Group className="d-flex flex-column gap-3">
      <div>
        <RichSelect
          items={SCORE_VISIBILITY_ITEMS}
          value={hideScoreMode}
          aria-label="Score visibility"
          id={`${idPrefix}-score-visibility-mode`}
          minWidth={300}
          disabled={!ruleEditable}
          onChange={handleModeChange}
        />
        {selectedDescription && (
          <Form.Text className="text-muted d-block">{selectedDescription}</Form.Text>
        )}
      </div>
      {hideScoreMode === 'hide_score_until_date' && (
        <div>
          <Form.Control
            id={`${idPrefix}-show-score-date`}
            type="datetime-local"
            step={1}
            aria-label="Show score on"
            value={value.visibleFromDate ?? ''}
            isInvalid={visibleFromDateInvalid}
            disabled={!ruleEditable}
            aria-invalid={visibleFromDateInvalid}
            aria-errormessage={
              visibleFromDateInvalid ? `${idPrefix}-show-score-date-error` : undefined
            }
            onChange={({ currentTarget }) =>
              onChange({ hidden: true, visibleFromDate: currentTarget.value })
            }
          />
          {visibleFromDateInvalid && (
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
        These settings apply after submissions are no longer allowed after the final deadline, after
        a time limit expires, or once their assessment instance is closed (manually or via
        autoclose). If after-deadline submissions are allowed, these settings apply only after the
        student's assessment instance closes or its time limit expires.
      </p>
      <p>
        The completion time can vary between students based on when they started or any
        accommodations they have.
      </p>
      <p>
        While a student has an active PrairieTest reservation, the per-exam settings on each
        PrairieTest exam govern visibility instead.
      </p>
    </>
  ),
  props: { id: 'after-complete-info-popover' },
};

function AfterCompleteCard({
  title = 'After completion',
  children,
}: {
  title?: string;
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
        <div className="text-muted small mt-1">
          What students can see once they can no longer answer questions on the assessment.
        </div>
      </div>
      <div className="d-flex flex-column gap-3">{children}</div>
    </div>
  );
}

export function DefaultAfterCompleteForm({
  title,
  displayTimezone,
}: {
  title?: string;
  displayTimezone: string;
}) {
  const { field: qvField } = useController<AccessControlFormData, 'defaultRule.questionVisibility'>(
    {
      name: 'defaultRule.questionVisibility',
    },
  );

  const { field: svField } = useController<AccessControlFormData, 'defaultRule.scoreVisibility'>({
    name: 'defaultRule.scoreVisibility',
    rules: { deps: qvField.name },
  });

  const { errors } = useFormState<AccessControlFormData>();
  const qvVisibleFromError: string | undefined = get(
    errors,
    'defaultRule.questionVisibility.visibleFromDate',
  )?.message;
  const visibleUntilDateError: string | undefined = get(
    errors,
    'defaultRule.questionVisibility.visibleUntilDate',
  )?.message;
  const svVisibleFromError: string | undefined = get(
    errors,
    'defaultRule.scoreVisibility.visibleFromDate',
  )?.message;

  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });
  const due = useWatch<AccessControlFormData, 'defaultRule.due'>({ name: 'defaultRule.due' });
  const lateDeadlines = useWatch<AccessControlFormData, 'defaultRule.lateDeadlines'>({
    name: 'defaultRule.lateDeadlines',
  });
  const durationMinutes = useWatch<AccessControlFormData, 'defaultRule.durationMinutes'>({
    name: 'defaultRule.durationMinutes',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  const hasPrairieTest = prairieTestExams.length > 0;
  const hasCompletionMechanism = defaultRuleHasCompletionMechanism({
    dateControlEnabled,
    due,
    lateDeadlines,
    durationMinutes,
    prairieTestExams,
  });

  return (
    <AfterCompleteCard title={title}>
      <div>
        <Form.Label className="fw-bold" htmlFor="defaultRule-question-visibility-mode">
          Question visibility
        </Form.Label>
        <QuestionVisibilityInput
          value={qvField.value}
          idPrefix="defaultRule"
          hasPrairieTest={hasPrairieTest}
          hasCompletionMechanism={hasCompletionMechanism}
          visibleFromDateError={qvVisibleFromError}
          visibleUntilDateError={visibleUntilDateError}
          displayTimezone={displayTimezone}
          onChange={qvField.onChange}
        />
      </div>
      <div>
        <Form.Label className="fw-bold" htmlFor="defaultRule-score-visibility-mode">
          Score visibility
        </Form.Label>
        <ScoreVisibilityInput
          value={svField.value}
          idPrefix="defaultRule"
          visibleFromDateError={svVisibleFromError}
          displayTimezone={displayTimezone}
          onChange={svField.onChange}
        />
      </div>
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
  const { trigger } = useFormContext<AccessControlFormData>();
  const defaultRuleQV = useWatch<AccessControlFormData, 'defaultRule.questionVisibility'>({
    name: 'defaultRule.questionVisibility',
  });
  const defaultRuleSV = useWatch<AccessControlFormData, 'defaultRule.scoreVisibility'>({
    name: 'defaultRule.scoreVisibility',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
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
    rules: { deps: qvField.name },
  });

  return (
    <AfterCompleteCard title={title}>
      <div>
        <FieldWrapper
          isOverridden={qvOverridden}
          label="Question visibility"
          onOverride={() => {
            qvField.onChange({ ...defaultRuleQV });
            addQvOverride();
            void trigger(svField.name);
          }}
          onRemoveOverride={() => {
            removeQvOverride();
            void trigger(svField.name);
          }}
        >
          <QuestionVisibilityInput
            value={qvField.value}
            idPrefix={`overrides-${index}`}
            hasPrairieTest={hasPrairieTest}
            visibleFromDateError={qvVisibleFromError}
            visibleUntilDateError={visibleUntilDateError}
            displayTimezone={displayTimezone}
            onChange={qvField.onChange}
          />
        </FieldWrapper>
      </div>
      <div>
        <FieldWrapper
          isOverridden={svOverridden}
          label="Score visibility"
          onOverride={() => {
            svField.onChange({ ...defaultRuleSV });
            addSvOverride();
            void trigger(qvField.name);
          }}
          onRemoveOverride={() => {
            removeSvOverride();
            void trigger(qvField.name);
          }}
        >
          <ScoreVisibilityInput
            value={svField.value}
            idPrefix={`overrides-${index}`}
            visibleFromDateError={svVisibleFromError}
            displayTimezone={displayTimezone}
            onChange={svField.onChange}
          />
        </FieldWrapper>
      </div>
    </AfterCompleteCard>
  );
}
