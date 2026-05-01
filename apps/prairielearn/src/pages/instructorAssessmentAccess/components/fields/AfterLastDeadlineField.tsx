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
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate } from '../utils/dateUtils.js';

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

const AFTER_LAST_DEADLINE_ITEMS: RichSelectItem<AfterLastDeadlineMode>[] = [
  {
    value: 'no_submissions',
    label: 'No submissions allowed',
    description: 'Students can still view but not submit',
  },
  {
    value: 'practice_submissions',
    label: 'Allow practice submissions',
    description: 'No credit is given for practice submissions',
  },
  {
    value: 'partial_credit',
    label: 'Allow submissions for partial credit',
    description: 'Students will receive partial credit for submissions after the deadline',
  },
];

function getMode(value: AfterLastDeadlineValue | null): AfterLastDeadlineMode {
  if (!value) return 'no_submissions';
  if (!value.allowSubmissions) return 'no_submissions';
  if (value.credit == null) return 'practice_submissions';
  return 'partial_credit';
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
  showNoDueDateWarning = true,
}: {
  value: AfterLastDeadlineValue | null;
  onChange: (value: AfterLastDeadlineValue | null) => void;
  overrideIndex?: number;
  displayTimezone: string;
  showNoDueDateWarning?: boolean;
}) {
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
  // keeping display values (last-deadline text, warnings) up to date.
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

  const getLastDeadlineText = () => {
    const lastDate = getLastDeadlineDate(lateDeadlines, dueDate);
    if (lastDate) {
      return (
        <>
          This will take effect after{' '}
          <FriendlyDate date={lastDate} timezone={displayTimezone} options={{ includeTz: false }} />
        </>
      );
    }
    return 'This will take effect after the last deadline';
  };

  const hasLastDeadline = !!dueDate || lateDeadlines.length > 0;

  const handleModeChange = (newMode: AfterLastDeadlineMode) => {
    switch (newMode) {
      case 'no_submissions':
        onChange({ allowSubmissions: false });
        break;
      case 'practice_submissions':
        onChange({ allowSubmissions: true });
        break;
      case 'partial_credit':
        onChange({ allowSubmissions: true, credit: 0 });
        break;
    }
  };

  return (
    <Form.Group>
      <small className="text-muted d-block">{getLastDeadlineText()}</small>
      <div className="mb-2 mt-2">
        <RichSelect
          items={AFTER_LAST_DEADLINE_ITEMS}
          value={mode}
          aria-label="After last deadline"
          id={`${idPrefix}-after-deadline-mode`}
          minWidth={300}
          onChange={handleModeChange}
        />
      </div>
      {showNoDueDateWarning && !hasLastDeadline && mode !== 'no_submissions' && (
        <Alert variant="warning" className="py-2 mb-2">
          This setting will have no effect because there is no due date set.
        </Alert>
      )}

      {mode === 'partial_credit' && (
        <div className="mt-2">
          <InputGroup>
            <Form.Control
              type="number"
              aria-label="Credit percentage after last deadline"
              aria-invalid={!!creditError}
              aria-errormessage={
                creditError ? `${idPrefix}-after-deadline-credit-error` : undefined
              }
              min="0"
              max="200"
              placeholder="Credit percentage"
              isInvalid={!!creditError}
              onWheel={({ currentTarget }) => currentTarget.blur()}
              {...register(creditFieldPath, {
                shouldUnregister: true,
                valueAsNumber: true,
                deps: creditDeps,
                validate: (v, formValues) => {
                  if (v == null || Number.isNaN(v)) return 'Credit is required';
                  if (v < 0 || v > 200) return 'Must be 0\u2013200%';
                  const { dueDate, dueCredit, lateDeadlines } = resolveConstraints(
                    formValues,
                    overrideIndex,
                  );
                  const precedingCredit =
                    lateDeadlines.at(-1)?.credit ?? (dueDate != null ? dueCredit : undefined);
                  if (precedingCredit != null && v > precedingCredit) {
                    return `Must not exceed ${precedingCredit}% (the preceding deadline's credit)`;
                  }
                  return true;
                },
              })}
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          {creditError && (
            <Form.Text
              id={`${idPrefix}-after-deadline-credit-error`}
              className="text-danger d-block"
              role="alert"
            >
              {creditError}
            </Form.Text>
          )}
          <Form.Text className="text-muted d-block">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );
}

export function DefaultAfterLastDeadlineField({ displayTimezone }: { displayTimezone: string }) {
  const { field } = useController<AccessControlFormData, 'defaultRule.afterLastDeadline'>({
    name: 'defaultRule.afterLastDeadline',
  });

  return (
    <div>
      <strong className="d-block mb-2">After last deadline</strong>
      <AfterLastDeadlineInput
        value={field.value}
        displayTimezone={displayTimezone}
        onChange={field.onChange}
      />
    </div>
  );
}

export function OverrideAfterLastDeadlineField({
  index,
  displayTimezone,
}: {
  index: number;
  displayTimezone: string;
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
        field.onChange(defaultRuleValue ?? { allowSubmissions: false });
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <AfterLastDeadlineInput
        value={field.value}
        overrideIndex={index}
        displayTimezone={displayTimezone}
        showNoDueDateWarning={false}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
