import { useEffect } from 'react';
import { Alert, Form, InputGroup } from 'react-bootstrap';
import {
  type FieldPath,
  get,
  useController,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate } from '../utils/dateUtils.js';

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

const AFTER_LAST_DEADLINE_ITEMS: RichSelectItem<AfterLastDeadlineMode>[] = [
  {
    value: 'no_submissions',
    label: 'No submissions allowed',
    description: 'Students can review their work based on After completion visibility settings',
  },
  {
    value: 'practice_submissions',
    label: 'Allow practice submissions',
    description: 'No credit is given for practice submissions',
  },
  {
    value: 'partial_credit',
    label: 'Allow submissions for partial credit',
    description: 'Students receive partial credit for submissions',
  },
];

/** Caller passes the *effective* late deadlines (overrides may inherit from default). */
export function getAfterLastDeadlineLabel(lateDeadlines: DeadlineEntry[]): string {
  if (lateDeadlines.length === 0) return 'After due date';
  if (lateDeadlines.length === 1) return 'After late deadline';
  return 'After late deadlines';
}

function getLastDeadlineNoun(lateDeadlines: DeadlineEntry[]): string {
  if (lateDeadlines.length === 0) return 'due date';
  if (lateDeadlines.length === 1) return 'late deadline';
  return 'late deadlines';
}

function getMode(value: AfterLastDeadlineValue): AfterLastDeadlineMode {
  if (!value.allowSubmissions) return 'no_submissions';
  if (value.credit === 0) return 'practice_submissions';
  return 'partial_credit';
}

function getDefaultPartialCredit(precedingCredit: number | undefined): number {
  // Match late-deadline defaults: choose 10 points below the preceding credit,
  // capping bonus-credit anchors at 100 and keeping partial credit positive.
  const anchor = precedingCredit === undefined ? 100 : Math.min(precedingCredit, 100);
  return Math.max(1, Math.min(anchor - 10, 99));
}

/**
 * Derive the effective dueDate, dueCredit, and lateDeadlines from form values,
 * handling override fallback via `overriddenFields`.
 */
function resolveConstraints(
  formValues: AccessControlFormData,
  overrideIndex?: number,
): { dueDate: string | null; dueCredit: number; lateDeadlines: DeadlineEntry[] } {
  if (overrideIndex == null) {
    const due = formValues.defaultRule.due;
    return {
      dueDate: due.date,
      dueCredit: due.credit ?? 100,
      lateDeadlines: formValues.defaultRule.lateDeadlines,
    };
  }
  const override = formValues.overrides[overrideIndex];
  const overriddenFields = override.overriddenFields;
  const effectiveDue = overriddenFields.includes('due') ? override.due : formValues.defaultRule.due;
  return {
    dueDate: effectiveDue.date,
    dueCredit: effectiveDue.credit ?? 100,
    lateDeadlines: overriddenFields.includes('lateDeadlines')
      ? override.lateDeadlines
      : formValues.defaultRule.lateDeadlines,
  };
}

function AfterLastDeadlineInput({
  value,
  onChange,
  overrideIndex,
  displayTimezone,
  isExam,
}: {
  value: AfterLastDeadlineValue;
  onChange: (value: AfterLastDeadlineValue) => void;
  overrideIndex?: number;
  displayTimezone: string;
  isExam: boolean;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const isOverride = overrideIndex != null;
  const creditFieldPath = isOverride
    ? (`overrides.${overrideIndex}.afterLastDeadline.credit` as const)
    : ('defaultRule.afterLastDeadline.credit' as const);
  const idPrefix = isOverride ? `overrides-${overrideIndex}` : 'defaultRule';

  // Field paths that affect credit validation — used for both display
  // reactivity (useWatch) and validation re-triggering (deps).
  const creditDeps: FieldPath<AccessControlFormData>[] = isOverride
    ? [
        'defaultRule.due',
        'defaultRule.lateDeadlines',
        `overrides.${overrideIndex}.overriddenFields`,
        `overrides.${overrideIndex}.due`,
        `overrides.${overrideIndex}.lateDeadlines`,
      ]
    : ['defaultRule.due', 'defaultRule.lateDeadlines'];

  const { register, getValues, trigger } = useFormContext<AccessControlFormData>();
  const { errors } = useFormState();
  const creditError: string | undefined = get(errors, creditFieldPath)?.message;

  // Watch dep fields so this component re-renders when they change,
  // keeping display values (last-deadline text) up to date.
  useWatch<AccessControlFormData>({ name: creditDeps });
  const {
    dueDate,
    dueCredit: effectiveDueCredit,
    lateDeadlines,
  } = resolveConstraints(getValues(), overrideIndex);

  const mode = getMode(value);

  // Re-validate the credit field when its preceding-credit inputs change.
  // RHF's `deps` on register triggers the other direction, so we drive this
  // explicitly. Use primitives (not object refs) so the effect is stable.
  const precedingCredit =
    lateDeadlines.at(-1)?.credit ?? (dueDate != null ? effectiveDueCredit : undefined);
  useEffect(() => {
    if (mode === 'partial_credit') {
      void trigger(creditFieldPath);
    }
  }, [trigger, creditFieldPath, mode, precedingCredit]);

  // For overrides we can't fully reason about the effective deadlines (override
  // stacking may produce a different set), so we fall back to a generic label.
  const label = isOverride ? 'After last deadline' : getAfterLastDeadlineLabel(lateDeadlines);

  const getLastDeadlineText = () => {
    const lastDate = getLastDeadlineDate(lateDeadlines, dueDate);
    if (lastDate) {
      return (
        <>
          This controls the ability to submit after{' '}
          <FriendlyDate date={lastDate} timezone={displayTimezone} options={{ includeTz: false }} />
          , until the course instance end date. Visibility is controlled by the after-completion
          settings.
        </>
      );
    }

    // TODO: we want to update the UI to completely hide the "after last deadline" options
    // when there are in fact no deadlines. That'll render this branch obsolete, but in the
    // meantime we have to show something here.
    return 'This controls the ability to submit until the course instance end date. Visibility is controlled by the after-completion settings.';
  };

  const handleModeChange = (newMode: AfterLastDeadlineMode) => {
    switch (newMode) {
      case 'no_submissions':
        onChange({ allowSubmissions: false });
        break;
      case 'practice_submissions':
        onChange({ allowSubmissions: true, credit: 0 });
        break;
      case 'partial_credit':
        onChange({
          allowSubmissions: true,
          credit:
            value.allowSubmissions && value.credit > 0
              ? value.credit
              : getDefaultPartialCredit(precedingCredit),
        });
        break;
    }
  };

  const showExamSubmissionsWarning = isExam && value.allowSubmissions === true;
  const deadlineNoun = isOverride ? 'last deadline' : getLastDeadlineNoun(lateDeadlines);

  return (
    <Form.Group>
      <small className="text-muted d-block">{getLastDeadlineText()}</small>
      <div className="mb-2 mt-2">
        <RichSelect
          items={AFTER_LAST_DEADLINE_ITEMS}
          value={mode}
          aria-label={label}
          id={`${idPrefix}-after-deadline-mode`}
          minWidth={300}
          disabled={!ruleEditable}
          onChange={handleModeChange}
        />
      </div>
      {showExamSubmissionsWarning && (
        <Alert variant="warning" className="mt-2 mb-0">
          This is an Exam assessment. Consider disallowing submissions after the {deadlineNoun}{' '}
          unless you want students to keep working.
        </Alert>
      )}
      {mode === 'partial_credit' && (
        <div className="mt-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <label
              htmlFor={`${idPrefix}-after-deadline-credit`}
              className="form-label mb-0 small text-body-secondary"
            >
              Credit
            </label>
            <InputGroup style={{ width: 'auto', flex: '0 0 auto' }}>
              <Form.Control
                id={`${idPrefix}-after-deadline-credit`}
                type="number"
                style={{ width: '6rem' }}
                aria-label="Credit percentage after last deadline"
                aria-invalid={!!creditError}
                aria-errormessage={
                  creditError ? `${idPrefix}-after-deadline-credit-error` : undefined
                }
                min="0"
                max="99"
                step={1}
                placeholder="0"
                isInvalid={!!creditError}
                disabled={!ruleEditable}
                {...register(creditFieldPath, {
                  shouldUnregister: true,
                  valueAsNumber: true,
                  deps: creditDeps,
                })}
              />
              <InputGroup.Text>%</InputGroup.Text>
            </InputGroup>
          </div>
          <Form.Text className="text-muted d-block">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
      {/* Outside the partial_credit block so cross-field errors (e.g. "requires a due date") show in all modes. */}
      {creditError && (
        <Form.Text
          id={`${idPrefix}-after-deadline-credit-error`}
          className="text-danger d-block"
          role="alert"
        >
          {creditError}
        </Form.Text>
      )}
    </Form.Group>
  );
}

export function DefaultAfterLastDeadlineField({
  displayTimezone,
  isExam,
}: {
  displayTimezone: string;
  isExam: boolean;
}) {
  const { field } = useController<AccessControlFormData, 'defaultRule.afterLastDeadline'>({
    name: 'defaultRule.afterLastDeadline',
  });
  const lateDeadlines = useWatch<AccessControlFormData, 'defaultRule.lateDeadlines'>({
    name: 'defaultRule.lateDeadlines',
  });
  const label = getAfterLastDeadlineLabel(lateDeadlines);

  return (
    <div>
      <strong className="d-block mb-2">{label}</strong>
      <AfterLastDeadlineInput
        value={field.value}
        displayTimezone={displayTimezone}
        isExam={isExam}
        onChange={field.onChange}
      />
    </div>
  );
}

export function OverrideAfterLastDeadlineField({
  index,
  displayTimezone,
  isExam,
}: {
  index: number;
  displayTimezone: string;
  isExam: boolean;
}) {
  const defaultRuleValue = useWatch<AccessControlFormData, 'defaultRule.afterLastDeadline'>({
    name: 'defaultRule.afterLastDeadline',
  });

  const { field } = useController<AccessControlFormData, `overrides.${number}.afterLastDeadline`>({
    name: `overrides.${index}.afterLastDeadline`,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(
    index,
    'afterLastDeadline',
  );

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="After last deadline"
      onOverride={() => {
        field.onChange(defaultRuleValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <AfterLastDeadlineInput
        value={field.value}
        overrideIndex={index}
        displayTimezone={displayTimezone}
        isExam={isExam}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
