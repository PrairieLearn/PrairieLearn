import { Temporal } from '@js-temporal/polyfill';
import stableStringify from 'fast-json-stable-stringify';
import { useEffect, useRef } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { get, useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import { endOfDayDatetime } from '../utils/dateUtils.js';

function DeadlineArrayInput({
  type,
  fieldArrayName,
  idPrefix,
  releaseDate,
  dueDate,
  validationReleaseDate,
  validationDueDate,
  deadlines,
  displayTimezone,
}: {
  type: 'early' | 'late';
  fieldArrayName:
    | 'mainRule.earlyDeadlines'
    | 'mainRule.lateDeadlines'
    | `overrides.${number}.earlyDeadlines`
    | `overrides.${number}.lateDeadlines`;
  idPrefix: string;
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  validationReleaseDate?: string | null | undefined;
  validationDueDate?: string | null | undefined;
  deadlines: DeadlineEntry[];
  displayTimezone: string;
}) {
  const { register, trigger } = useFormContext<AccessControlFormData>();
  const isEarly = type === 'early';

  const {
    fields: deadlineFields,
    append: appendDeadline,
    remove: removeDeadline,
  } = useFieldArray<AccessControlFormData, typeof fieldArrayName>({
    name: fieldArrayName,
  });

  const { errors } = useFormState();

  const deadlinesStringified = stableStringify(deadlines);
  // Store constraint values in refs so the validate function (which is captured
  // once by register()) always reads current values instead of stale closures.
  const dueDateRef = useRef(validationDueDate ?? dueDate);
  const releaseDateRef = useRef(validationReleaseDate ?? releaseDate);
  const deadlinesRef = useRef(deadlines);
  dueDateRef.current = validationDueDate ?? dueDate;
  releaseDateRef.current = validationReleaseDate ?? releaseDate;
  deadlinesRef.current = deadlines;

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
  }, [deadlineFields.length, deadlinesStringified, dueDate, releaseDate, fieldArrayName, trigger]);

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

    // Check for duplicate dates within this deadline array.
    for (let i = 0; i < currentDeadlines.length; i++) {
      if (i !== index && currentDeadlines[i]?.date === value) {
        return 'Duplicate deadline date';
      }
    }

    if (isEarly) {
      if (currentDueDate && deadlineDate >= currentDueDate) {
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
      if (currentDueDate && deadlineDate <= currentDueDate) {
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
    } else {
      if (value < 0 || value > 99) return 'Credit must be 0-99%';
    }
    const currentDeadlines = deadlinesRef.current;
    if (index > 0 && value >= (currentDeadlines.at(index - 1)?.credit ?? 0)) {
      return 'Credit must be less than previous deadline';
    }
    return true;
  };

  const addDeadline = () => {
    let candidateDate: Temporal.PlainDate | null = null;

    // Find the last deadline that has an actual date value — earlier entries
    // may be empty if the user hasn't filled them in yet.
    let lastFilledDate = '';
    for (let i = deadlines.length - 1; i >= 0; i--) {
      if (deadlines[i].date) {
        lastFilledDate = deadlines[i].date;
        break;
      }
    }

    if (isEarly && dueDate) {
      // Early deadlines must be before the due date. To leave room for
      // additional deadlines, place the new one at min(anchor + 1 week,
      // midpoint to maxDate) — this uses natural spacing when there's
      // plenty of room and compresses when the window is tight.
      const maxDate = Temporal.PlainDateTime.from(dueDate).toPlainDate().subtract({ days: 1 });
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
      // If daysToMax <= 0, no room — candidateDate stays null → empty field
    } else if (isEarly && releaseDate) {
      // No due date constraint — just space 1 week after anchor.
      const anchor = lastFilledDate
        ? Temporal.PlainDateTime.from(lastFilledDate).toPlainDate()
        : Temporal.PlainDateTime.from(releaseDate).toPlainDate();
      candidateDate = anchor.add({ weeks: 1 });
    } else if (!isEarly && dueDate) {
      // Late deadlines have no upper bound — 1 week spacing works.
      const anchor = lastFilledDate
        ? Temporal.PlainDateTime.from(lastFilledDate).toPlainDate()
        : Temporal.PlainDateTime.from(dueDate).toPlainDate();
      candidateDate = anchor.add({ weeks: 1 });
    }

    const defaultDate = candidateDate ? endOfDayDatetime(candidateDate) : '';
    const previousCredit = deadlines.at(-1)?.credit ?? (isEarly ? 110 : 90);
    const defaultCredit = previousCredit - 1;
    appendDeadline({ date: defaultDate, credit: defaultCredit });
  };

  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Form.Check
          type="checkbox"
          id={`${idPrefix}-${type}-deadlines-enabled`}
          label={<strong>{label}</strong>}
          checked={deadlineFields.length > 0}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              addDeadline();
            } else {
              // Remove all deadlines
              removeDeadline();
            }
          }}
        />
        <Button size="sm" variant="outline-primary" onClick={addDeadline}>
          Add {isEarly ? 'early' : 'late'}
        </Button>
      </div>

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
              {getDateError(index) && (
                <Form.Text
                  id={`${idPrefix}-${type}-deadline-${index}-date-error`}
                  className="text-danger"
                  role="alert"
                >
                  {getDateError(index)}
                </Form.Text>
              )}
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
                  max={isEarly ? '200' : '99'}
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

export function MainDeadlineArrayField({
  type,
  displayTimezone,
}: {
  type: 'early' | 'late';
  displayTimezone: string;
}) {
  const isEarly = type === 'early';
  const fieldName = isEarly ? 'mainRule.earlyDeadlines' : 'mainRule.lateDeadlines';

  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const dueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const deadlines = useWatch<AccessControlFormData, typeof fieldName>({
    name: fieldName,
  });

  const shouldShow = isEarly || (dueDate !== null && !!dueDate);

  if (!shouldShow) return null;

  return (
    <DeadlineArrayInput
      type={type}
      fieldArrayName={fieldName}
      idPrefix="mainRule"
      releaseDate={releaseDate}
      dueDate={dueDate}
      validationReleaseDate={releaseDate}
      validationDueDate={dueDate}
      deadlines={deadlines}
      displayTimezone={displayTimezone}
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

  const { setValue } = useFormContext<AccessControlFormData>();
  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, fieldPath);

  const mainDeadlines = useWatch<AccessControlFormData, `mainRule.${typeof fieldPath}`>({
    name: `mainRule.${fieldPath}`,
  });

  const deadlines = useWatch<AccessControlFormData, `overrides.${number}.${typeof fieldPath}`>({
    name: `overrides.${index}.${fieldPath}`,
  });

  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'releaseDate');
  const overrideReleaseDate = useWatch<AccessControlFormData, `overrides.${number}.releaseDate`>({
    name: `overrides.${index}.releaseDate`,
  });
  const { isOverridden: dueDateOverridden } = useOverrideField(index, 'dueDate');
  const overrideDueDate = useWatch<AccessControlFormData, `overrides.${number}.dueDate`>({
    name: `overrides.${index}.dueDate`,
  });

  const effectiveReleaseDate = releaseDateOverridden ? overrideReleaseDate : mainReleaseDate;
  const effectiveDueDate = dueDateOverridden ? overrideDueDate : mainDueDate;
  const validationReleaseDate = releaseDateOverridden ? overrideReleaseDate : undefined;
  const validationDueDate = dueDateOverridden ? overrideDueDate : undefined;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label={label}
      onOverride={() => {
        const copied = mainDeadlines.map((d) => ({ ...d }));
        setValue(`overrides.${index}.${fieldPath}`, copied, { shouldDirty: true });
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DeadlineArrayInput
        type={type}
        fieldArrayName={`overrides.${index}.${fieldPath}`}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        dueDate={effectiveDueDate}
        validationReleaseDate={validationReleaseDate}
        validationDueDate={validationDueDate}
        deadlines={deadlines}
        displayTimezone={displayTimezone}
      />
    </FieldWrapper>
  );
}
