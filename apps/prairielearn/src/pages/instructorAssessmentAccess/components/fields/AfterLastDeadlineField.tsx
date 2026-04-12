import { Alert, Form, InputGroup } from 'react-bootstrap';
import {
  type FieldPath,
  get,
  useController,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { run } from '@prairielearn/run';
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
  const { allowSubmissions, credit } = value;
  if (!allowSubmissions) return 'no_submissions';
  if (credit === undefined) return 'practice_submissions';
  return 'partial_credit';
}

/**
 * Derive the effective dueDate and lateDeadlines from form values, handling
 * override fallback via `overriddenFields`.
 */
function resolveConstraints(
  formValues: AccessControlFormData,
  overrideIndex?: number,
): { dueDate: string | null; lateDeadlines: DeadlineEntry[] } {
  if (overrideIndex == null) {
    return {
      dueDate: formValues.mainRule.dueDate,
      lateDeadlines: formValues.mainRule.lateDeadlines,
    };
  }
  const override = formValues.overrides[overrideIndex];
  const overriddenFields = override.overriddenFields;
  return {
    dueDate: overriddenFields.includes('dueDate') ? override.dueDate : formValues.mainRule.dueDate,
    lateDeadlines: overriddenFields.includes('lateDeadlines')
      ? override.lateDeadlines
      : formValues.mainRule.lateDeadlines,
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
    : ('mainRule.afterLastDeadline.credit' as const);
  const idPrefix = isOverride ? `overrides-${overrideIndex}` : 'mainRule';

  // Field paths that affect credit validation — used for both display
  // reactivity (useWatch) and validation re-triggering (deps).
  const creditDeps = run<FieldPath<AccessControlFormData>[]>(() => {
    if (isOverride) {
      return [
        'mainRule.dueDate',
        'mainRule.lateDeadlines',
        `overrides.${overrideIndex}.overriddenFields`,
        `overrides.${overrideIndex}.dueDate`,
        `overrides.${overrideIndex}.lateDeadlines`,
      ];
    }
    return ['mainRule.dueDate', 'mainRule.lateDeadlines'];
  });

  const { register, getValues } = useFormContext<AccessControlFormData>();
  const { errors } = useFormState();
  const creditError: string | undefined = get(errors, creditFieldPath)?.message;

  // Watch dep fields so this component re-renders when they change,
  // keeping display values (last-deadline text, warnings) up to date.
  useWatch<AccessControlFormData>({ name: creditDeps });
  const { dueDate, lateDeadlines } = resolveConstraints(getValues(), overrideIndex);

  const mode = getMode(value);

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
      <div>
        <strong>After last deadline</strong>
        <br />
        <small className="text-muted">{getLastDeadlineText()}</small>
      </div>
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
              {...register(creditFieldPath, {
                shouldUnregister: true,
                valueAsNumber: true,
                deps: creditDeps,
                validate: (v, formValues) => {
                  if (v == null || Number.isNaN(v)) return 'Credit is required';
                  if (v < 0 || v > 200) return 'Must be 0\u2013200%';
                  const { dueDate, lateDeadlines } = resolveConstraints(formValues, overrideIndex);
                  const precedingCredit =
                    lateDeadlines.at(-1)?.credit ?? (dueDate != null ? 100 : undefined);
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

export function MainAfterLastDeadlineField({ displayTimezone }: { displayTimezone: string }) {
  const { field } = useController<AccessControlFormData, 'mainRule.afterLastDeadline'>({
    name: 'mainRule.afterLastDeadline',
  });

  return (
    <AfterLastDeadlineInput
      value={field.value}
      displayTimezone={displayTimezone}
      onChange={field.onChange}
    />
  );
}

export function OverrideAfterLastDeadlineField({
  index,
  displayTimezone,
}: {
  index: number;
  displayTimezone: string;
}) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.afterLastDeadline'>({
    name: 'mainRule.afterLastDeadline',
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
        field.onChange(mainValue ?? { allowSubmissions: false });
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
