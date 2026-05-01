import { Temporal } from '@js-temporal/polyfill';
import stableStringify from 'fast-json-stable-stringify';
import { useEffect, useRef } from 'react';
import { Alert, Button, Form, InputGroup } from 'react-bootstrap';
import {
  type FieldArrayWithId,
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
  get,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { ToggleTitle } from '../ToggleTitle.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import { endOfDayDatetime } from '../utils/dateUtils.js';

type DeadlineArrayFieldName =
  | 'defaultRule.earlyDeadlines'
  | 'defaultRule.lateDeadlines'
  | `overrides.${number}.earlyDeadlines`
  | `overrides.${number}.lateDeadlines`;

function computeNextDeadline({
  type,
  deadlines,
  releaseDate,
  dueDate,
  dueCredit,
  displayTimezone,
}: {
  type: 'early' | 'late';
  deadlines: DeadlineEntry[];
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  dueCredit: number;
  displayTimezone: string;
}): DeadlineEntry {
  const isEarly = type === 'early';
  let candidateDate: Temporal.PlainDate | null = null;

  let lastFilledDate = '';
  for (let i = deadlines.length - 1; i >= 0; i--) {
    if (deadlines[i].date) {
      lastFilledDate = deadlines[i].date;
      break;
    }
  }

  if (isEarly && dueDate) {
    // Early deadlines must be on or before the due date. Place the new one at
    // min(anchor + 1 week, midpoint to maxDate) so we get natural spacing when
    // there's room and compress when the window is tight.
    const maxDate = Temporal.PlainDateTime.from(dueDate).toPlainDate();
    const anchor = lastFilledDate
      ? Temporal.PlainDateTime.from(lastFilledDate).toPlainDate()
      : releaseDate
        ? Temporal.PlainDateTime.from(releaseDate).toPlainDate()
        : Temporal.Now.plainDateISO(displayTimezone);

    const daysToMax = anchor.until(maxDate).days;
    if (daysToMax > 0) {
      const weekOut = anchor.add({ weeks: 1 });
      const midpoint = anchor.add({ days: Math.ceil(daysToMax / 2) });
      candidateDate = Temporal.PlainDate.compare(weekOut, midpoint) <= 0 ? weekOut : midpoint;
    }
  } else if (isEarly && releaseDate) {
    const anchor = lastFilledDate
      ? Temporal.PlainDateTime.from(lastFilledDate).toPlainDate()
      : Temporal.PlainDateTime.from(releaseDate).toPlainDate();
    candidateDate = anchor.add({ weeks: 1 });
  } else if (!isEarly && dueDate) {
    const anchor = lastFilledDate
      ? Temporal.PlainDateTime.from(lastFilledDate).toPlainDate()
      : Temporal.PlainDateTime.from(dueDate).toPlainDate();
    candidateDate = anchor.add({ weeks: 1 });
  }

  const defaultDate = candidateDate ? endOfDayDatetime(candidateDate) : '';
  const previousCredit = deadlines.at(-1)?.credit;
  // Early deadlines are disallowed when a custom due credit is set, so the
  // early branch can assume dueCredit is the default 100 and start at 110.
  const defaultCredit =
    previousCredit !== undefined ? previousCredit - 1 : isEarly ? 110 : Math.max(0, dueCredit - 10);
  return { date: defaultDate, credit: defaultCredit };
}

function DeadlineArrayInput({
  type,
  fieldArrayName,
  idPrefix,
  releaseDate,
  dueDate,
  dueCredit,
  customDueCreditSet,
  validationReleaseDate,
  validationDueDate,
  deadlines,
  displayTimezone,
  renderInlineHeader = true,
  deadlineFields,
  appendDeadline,
  removeDeadline,
}: {
  type: 'early' | 'late';
  fieldArrayName: DeadlineArrayFieldName;
  idPrefix: string;
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  /** Effective due-date credit (with default 100). Caps late-deadline credits. */
  dueCredit: number;
  /** Effective `customCredit` flag on the due date. Used to block adding early deadlines. */
  customDueCreditSet: boolean;
  validationReleaseDate?: string | null | undefined;
  validationDueDate?: string | null | undefined;
  deadlines: DeadlineEntry[];
  displayTimezone: string;
  renderInlineHeader?: boolean;
  deadlineFields: FieldArrayWithId<AccessControlFormData, DeadlineArrayFieldName>[];
  appendDeadline: UseFieldArrayAppend<AccessControlFormData, DeadlineArrayFieldName>;
  removeDeadline: UseFieldArrayRemove;
}) {
  const { register, trigger } = useFormContext<AccessControlFormData>();
  const isEarly = type === 'early';
  const addEarlyDisabled = isEarly && customDueCreditSet;
  const addEarlyDisabledTitle = addEarlyDisabled
    ? 'Early deadlines are not allowed when custom due credit is set.'
    : undefined;

  const { errors } = useFormState();

  const deadlinesStringified = stableStringify(deadlines);
  // Store constraint values in refs so the validate function (which is captured
  // once by register()) always reads current values instead of stale closures.
  const dueDateRef = useRef(validationDueDate ?? dueDate);
  const releaseDateRef = useRef(validationReleaseDate ?? releaseDate);
  const deadlinesRef = useRef(deadlines);
  const dueCreditRef = useRef(dueCredit);
  dueDateRef.current = validationDueDate ?? dueDate;
  releaseDateRef.current = validationReleaseDate ?? releaseDate;
  deadlinesRef.current = deadlines;
  dueCreditRef.current = dueCredit;

  // Re-validate all deadline dates and credits when the number of deadlines
  // changes (handles append and remove) or when external constraints change.
  // Without this, react-hook-form won't run validators on newly appended fields
  // or re-check existing fields against updated constraints.
  useEffect(() => {
    if (deadlineFields.length > 0) {
      for (let i = 0; i < deadlineFields.length; i++) {
        void trigger(`${fieldArrayName}.${i}.date`);
        void trigger(`${fieldArrayName}.${i}.credit`);
      }
    }
  }, [
    deadlineFields.length,
    deadlinesStringified,
    dueDate,
    dueCredit,
    releaseDate,
    fieldArrayName,
    trigger,
  ]);

  const getDateError = (index: number): string | undefined => {
    return get(errors, `${fieldArrayName}.${index}.date`)?.message;
  };

  const getCreditError = (index: number): string | undefined => {
    return get(errors, `${fieldArrayName}.${index}.credit`)?.message;
  };

  const getTimeRangeText = (index: number) => {
    const deadline = deadlines.at(index);
    if (!deadline?.date) return null;

    const anchorDate = isEarly ? releaseDate : dueDate;
    const start = (index > 0 ? deadlines[index - 1].date : null) ?? anchorDate;
    const end = deadline.date;

    if (!start) {
      const prefix = isEarly ? 'While accessible' : 'After due date';
      return (
        <>
          {prefix} –{' '}
          <FriendlyDate
            date={Temporal.PlainDateTime.from(end)}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />
        </>
      );
    }

    return (
      <>
        <FriendlyDate
          date={Temporal.PlainDateTime.from(start)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
        />{' '}
        –{' '}
        <FriendlyDate
          date={Temporal.PlainDateTime.from(end)}
          timezone={displayTimezone}
          options={{ includeTz: false }}
        />
      </>
    );
  };

  // Read from refs to avoid stale closures — register() captures the validate
  // function once, but these constraint values change over the form's lifetime.
  const validateDate = (value: string, index: number) => {
    if (!value) return 'Date is required';

    const currentDueDate = dueDateRef.current ? new Date(dueDateRef.current) : null;
    if (!currentDueDate && !isEarly) {
      return 'Late deadlines require a due date';
    }

    const deadlineDate = new Date(value);
    const currentReleaseDate = releaseDateRef.current ? new Date(releaseDateRef.current) : null;
    const currentDeadlines = deadlinesRef.current;

    for (let i = 0; i < currentDeadlines.length; i++) {
      if (i !== index && currentDeadlines[i]?.date === value) {
        return 'Duplicate deadline date';
      }
    }

    if (isEarly) {
      if (currentDueDate && deadlineDate > currentDueDate) {
        return 'Early deadline is out of range';
      }
      if (index > 0 && currentDeadlines[index - 1]?.date) {
        if (deadlineDate <= new Date(currentDeadlines[index - 1].date)) {
          return 'Must be after the previous deadline';
        }
      }
      if (currentReleaseDate && deadlineDate <= currentReleaseDate) {
        return 'Deadline is out of range';
      }
    } else {
      if (currentReleaseDate && deadlineDate <= currentReleaseDate) {
        return 'Deadline is out of range';
      }
      if (currentDueDate && deadlineDate < currentDueDate) {
        return 'Late deadline is out of range';
      }
      if (index > 0 && currentDeadlines[index - 1]?.date) {
        if (deadlineDate <= new Date(currentDeadlines[index - 1].date)) {
          return 'Must be after the previous deadline';
        }
      }
    }

    return true;
  };

  const validateCredit = (value: number, index: number) => {
    if (!Number.isFinite(value)) return 'Credit is required';
    if (isEarly) {
      if (value < 101 || value > 200) return 'Credit must be 101-200%';
    } else if (dueCreditRef.current !== 0) {
      // Late credit must be < 100 AND < dueCredit. When dueCredit >= 100 the
      // tighter bound is 100; when dueCredit < 100 it's dueCredit itself.
      // Skip when dueCredit === 0 — the validator forbids late deadlines
      // entirely at 0% due credit, so a per-field error would be noise.
      const cap = Math.min(100, dueCreditRef.current);
      if (value < 0 || value >= cap) {
        return cap === 100
          ? 'Credit must be 0-99%'
          : `Credit must be less than ${cap}% (due credit)`;
      }
    }
    const currentDeadlines = deadlinesRef.current;
    if (index > 0 && value >= (currentDeadlines.at(index - 1)?.credit ?? 0)) {
      return 'Credit must be less than previous deadline';
    }
    return true;
  };

  const addDeadline = () => {
    appendDeadline(
      computeNextDeadline({ type, deadlines, releaseDate, dueDate, dueCredit, displayTimezone }),
    );
  };

  return (
    <div>
      {renderInlineHeader && (
        <div className="d-flex justify-content-between align-items-center mb-2">
          <ToggleTitle
            id={`${idPrefix}-${type}-deadlines-enabled`}
            label={isEarly ? 'Early deadlines' : 'Late deadlines'}
            checked={deadlineFields.length > 0}
            disabled={addEarlyDisabled && deadlineFields.length === 0}
            title={
              addEarlyDisabled && deadlineFields.length === 0 ? addEarlyDisabledTitle : undefined
            }
            onChange={(checked) => {
              if (checked) {
                addDeadline();
              } else {
                removeDeadline();
              }
            }}
          />
          <Button
            size="sm"
            variant="outline-primary"
            disabled={addEarlyDisabled}
            title={addEarlyDisabledTitle}
            onClick={addDeadline}
          >
            Add {isEarly ? 'early' : 'late'}
          </Button>
        </div>
      )}

      {addEarlyDisabled && (
        <Alert variant="secondary" className="py-2 mt-2 mb-0">
          Clear the custom value on due date credit to allow an early deadline.
        </Alert>
      )}

      {deadlineFields.map((deadlineField, index) => (
        <div key={deadlineField.id} className="mb-3">
          <div className="d-flex gap-2 mb-1 flex-wrap align-items-start">
            <div className="flex-grow-1">
              <Form.Control
                type="datetime-local"
                step={1}
                defaultValue={deadlineField.date}
                aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} date`}
                aria-invalid={!!getDateError(index)}
                aria-errormessage={
                  getDateError(index)
                    ? `${idPrefix}-${type}-deadline-${index}-date-error`
                    : undefined
                }
                placeholder="Deadline Date"
                {...register(`${fieldArrayName}.${index}.date`, {
                  validate: (value) => validateDate(value, index),
                })}
              />
            </div>
            <div className="d-flex gap-2 align-items-center">
              <label
                className="form-label text-body-secondary mt-2 ms-auto"
                htmlFor={`${idPrefix}-${type}-deadline-${index}-credit`}
              >
                Credit
              </label>
              <InputGroup style={{ width: 'auto', flex: '0 0 auto' }}>
                <Form.Control
                  id={`${idPrefix}-${type}-deadline-${index}-credit`}
                  type="number"
                  defaultValue={deadlineField.credit}
                  style={{ width: '5rem' }}
                  aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} credit percentage`}
                  aria-invalid={!!getCreditError(index)}
                  aria-errormessage={
                    getCreditError(index)
                      ? `${idPrefix}-${type}-deadline-${index}-credit-error`
                      : undefined
                  }
                  placeholder="100"
                  min={isEarly ? '101' : '0'}
                  max={isEarly ? '200' : Math.min(99, dueCredit - 1)}
                  onWheel={({ currentTarget }) => currentTarget.blur()}
                  {...register(`${fieldArrayName}.${index}.credit`, {
                    valueAsNumber: true,
                    validate: (value) => validateCredit(value, index),
                  })}
                />
                <InputGroup.Text>%</InputGroup.Text>
              </InputGroup>
              <Button
                size="sm"
                variant="outline-danger"
                aria-label={`Remove ${isEarly ? 'early' : 'late'} deadline ${index + 1}`}
                onClick={() => removeDeadline(index)}
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {getDateError(index) && (
            <Form.Text
              id={`${idPrefix}-${type}-deadline-${index}-date-error`}
              className="text-danger d-block"
              role="alert"
            >
              {getDateError(index)}
            </Form.Text>
          )}
          {getCreditError(index) && (
            <Form.Text
              id={`${idPrefix}-${type}-deadline-${index}-credit-error`}
              className="text-danger d-block"
              role="alert"
            >
              {getCreditError(index)}
            </Form.Text>
          )}
          <Form.Text className="text-muted">{getTimeRangeText(index)}</Form.Text>
        </div>
      ))}
    </div>
  );
}

export function DefaultDeadlineArrayField({
  type,
  displayTimezone,
}: {
  type: 'early' | 'late';
  displayTimezone: string;
}) {
  const isEarly = type === 'early';
  const fieldName = isEarly ? 'defaultRule.earlyDeadlines' : 'defaultRule.lateDeadlines';

  const releaseDate = useWatch<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });

  const due = useWatch<AccessControlFormData, 'defaultRule.due'>({
    name: 'defaultRule.due',
  });

  const deadlines = useWatch<AccessControlFormData, typeof fieldName>({
    name: fieldName,
  });

  const { fields, append, remove } = useFieldArray<AccessControlFormData, typeof fieldName>({
    name: fieldName,
  });

  const dueDate = due.date;
  const dueCredit = due.credit ?? 100;

  // Late deadlines are meaningless without a due date to anchor against — hide
  // the empty section in that case. When data exists (either type), always
  // render so validation errors guide the user to fix invalid state.
  if (!isEarly && deadlines.length === 0 && !dueDate) return null;

  return (
    <DeadlineArrayInput
      type={type}
      fieldArrayName={fieldName}
      idPrefix="defaultRule"
      releaseDate={releaseDate}
      dueDate={dueDate}
      dueCredit={dueCredit}
      customDueCreditSet={due.customCredit}
      validationReleaseDate={releaseDate}
      validationDueDate={dueDate}
      deadlines={deadlines}
      displayTimezone={displayTimezone}
      deadlineFields={fields}
      appendDeadline={append}
      removeDeadline={remove}
    />
  );
}

export function OverrideDeadlineArrayField({
  index,
  type,
  displayTimezone,
}: {
  index: number;
  type: 'early' | 'late';
  displayTimezone: string;
}) {
  const isEarly = type === 'early';
  const fieldPath = isEarly ? 'earlyDeadlines' : 'lateDeadlines';
  const label = isEarly ? 'Early deadlines' : 'Late deadlines';
  const fieldArrayName = `overrides.${index}.${fieldPath}` as const;
  const idPrefix = `overrides-${index}`;

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, fieldPath);

  const defaultRuleDeadlines = useWatch<AccessControlFormData, `defaultRule.${typeof fieldPath}`>({
    name: `defaultRule.${fieldPath}`,
  });

  const deadlines = useWatch<AccessControlFormData, typeof fieldArrayName>({
    name: fieldArrayName,
  });

  const defaultRuleReleaseDate = useWatch<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });
  const defaultRuleDue = useWatch<AccessControlFormData, 'defaultRule.due'>({
    name: 'defaultRule.due',
  });

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'release');
  const overrideReleaseDate = useWatch<AccessControlFormData, `overrides.${number}.release.date`>({
    name: `overrides.${index}.release.date`,
  });
  const { isOverridden: dueOverridden } = useOverrideField(index, 'due');
  const overrideDue = useWatch<AccessControlFormData, `overrides.${number}.due`>({
    name: `overrides.${index}.due`,
  });

  const effectiveReleaseDate = releaseDateOverridden ? overrideReleaseDate : defaultRuleReleaseDate;
  const effectiveDue = dueOverridden ? overrideDue : defaultRuleDue;
  const effectiveDueDate = effectiveDue.date;
  const effectiveDueCredit = effectiveDue.credit ?? 100;
  const validationReleaseDate = releaseDateOverridden ? overrideReleaseDate : undefined;
  const validationDueDate = dueOverridden ? overrideDue.date : undefined;

  const { fields, append, remove, replace } = useFieldArray<
    AccessControlFormData,
    typeof fieldArrayName
  >({
    name: fieldArrayName,
  });

  // See DefaultDeadlineArrayField: late deadlines need a due date to anchor.
  if (!isEarly && !isOverridden && deadlines.length === 0 && !effectiveDueDate) return null;

  const nextDeadline = () =>
    computeNextDeadline({
      type,
      deadlines,
      releaseDate: effectiveReleaseDate,
      dueDate: effectiveDueDate,
      dueCredit: effectiveDueCredit,
      displayTimezone,
    });

  const addEarlyDisabled = isEarly && effectiveDue.customCredit;
  const addEarlyDisabledTitle = addEarlyDisabled
    ? 'Early deadlines are not allowed when custom due credit is set.'
    : undefined;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label={label}
      headerToggle={
        <ToggleTitle
          id={`${idPrefix}-${type}-deadlines-enabled`}
          label={label}
          checked={fields.length > 0}
          disabled={addEarlyDisabled && fields.length === 0}
          title={addEarlyDisabled && fields.length === 0 ? addEarlyDisabledTitle : undefined}
          onChange={(checked) => (checked ? append(nextDeadline()) : remove())}
        />
      }
      headerAction={
        <Button
          size="sm"
          variant="outline-primary"
          disabled={addEarlyDisabled}
          title={addEarlyDisabledTitle}
          onClick={() => append(nextDeadline())}
        >
          Add {isEarly ? 'early' : 'late'}
        </Button>
      }
      onOverride={() => {
        const copied = defaultRuleDeadlines.map((d) => ({ ...d }));
        replace(copied);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      {fields.length === 0 && (
        <Alert variant="info" className="py-2 mb-0">
          With no {type} deadlines set, this override clears any {type} deadlines inherited from the
          defaults or earlier overrides. Click "Remove override" to inherit them instead.
        </Alert>
      )}
      <DeadlineArrayInput
        type={type}
        fieldArrayName={fieldArrayName}
        idPrefix={idPrefix}
        releaseDate={effectiveReleaseDate}
        dueDate={effectiveDueDate}
        dueCredit={effectiveDueCredit}
        customDueCreditSet={effectiveDue.customCredit}
        validationReleaseDate={validationReleaseDate}
        validationDueDate={validationDueDate}
        deadlines={deadlines}
        displayTimezone={displayTimezone}
        renderInlineHeader={false}
        deadlineFields={fields}
        appendDeadline={append}
        removeDeadline={remove}
      />
    </FieldWrapper>
  );
}
