import { Temporal } from '@js-temporal/polyfill';
import stableStringify from 'fast-json-stable-stringify';
import { useEffect } from 'react';
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

import { run } from '@prairielearn/run';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE } from '../../../../schemas/accessControl.js';
import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
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

function clampCredit(value: number, type: 'early' | 'late'): number {
  return Math.max(0, Math.min(type === 'early' ? 200 : 99, value));
}

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
  const defaultCredit = run(() => {
    if (isEarly) {
      return clampCredit(
        previousCredit !== undefined ? previousCredit - 1 : dueCredit + 10,
        'early',
      );
    }
    // Anchor at min(dueCredit, 100) so dueCredit > 100 still lands on a clean
    // 90 instead of clamping to 99.
    const anchor = previousCredit ?? Math.min(dueCredit, 100);
    return clampCredit(anchor - 10, 'late');
  });
  return { date: defaultDate, credit: defaultCredit };
}

function getAddEarlyDisabledTitle(dueCredit: number): string | undefined {
  if (dueCredit < 100) {
    return 'Early deadlines are not allowed when due date credit is below 100%.';
  }
  if (dueCredit >= 200) {
    return 'Early deadlines require credit above due credit, but due date credit is already 200%.';
  }
  return undefined;
}

function getDeadlineLimitDisabledTitle(type: 'early' | 'late', count: number): string | undefined {
  if (count < MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE) return undefined;
  return `A rule can have at most ${MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE} ${type} deadlines.`;
}

function DeadlineArrayInput({
  type,
  fieldArrayName,
  idPrefix,
  releaseDate,
  dueDate,
  dueCredit,
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
  /** Effective due-date credit (with default 100). */
  dueCredit: number;
  validationReleaseDate?: string | null | undefined;
  validationDueDate?: string | null | undefined;
  deadlines: DeadlineEntry[];
  displayTimezone: string;
  renderInlineHeader?: boolean;
  deadlineFields: FieldArrayWithId<AccessControlFormData, DeadlineArrayFieldName>[];
  appendDeadline: UseFieldArrayAppend<AccessControlFormData, DeadlineArrayFieldName>;
  removeDeadline: UseFieldArrayRemove;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const { register, trigger } = useFormContext<AccessControlFormData>();
  const isEarly = type === 'early';
  const addEarlyDisabledTitle = isEarly ? getAddEarlyDisabledTitle(dueCredit) : undefined;
  const addLimitDisabledTitle = getDeadlineLimitDisabledTitle(type, deadlineFields.length);
  const addDisabledTitle = addEarlyDisabledTitle ?? addLimitDisabledTitle;
  const addEarlyDisabled = addEarlyDisabledTitle !== undefined;
  const addDisabled = addDisabledTitle !== undefined;

  const { errors } = useFormState();

  const deadlinesStringified = stableStringify(deadlines);
  const effectiveValidationDueDate = validationDueDate ?? dueDate;
  const effectiveValidationReleaseDate = validationReleaseDate ?? releaseDate;

  // Re-run resolver validation for all deadline dates and credits when the
  // number of deadlines changes (handles append and remove) or when external
  // constraints change.
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
    effectiveValidationDueDate,
    dueCredit,
    effectiveValidationReleaseDate,
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
            disabled={!ruleEditable || (addEarlyDisabled && deadlineFields.length === 0)}
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
          {ruleEditable && (
            <Button
              size="sm"
              variant="outline-primary"
              disabled={addDisabled}
              title={addDisabledTitle}
              onClick={addDeadline}
            >
              Add {isEarly ? 'early' : 'late'}
            </Button>
          )}
        </div>
      )}

      {addDisabledTitle && (
        <Alert variant="secondary" className="py-2 mt-2 mb-2">
          {addDisabledTitle}
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
                disabled={!ruleEditable}
                {...register(`${fieldArrayName}.${index}.date`)}
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
                  style={{ width: '6rem' }}
                  aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} credit percentage`}
                  aria-invalid={!!getCreditError(index)}
                  aria-errormessage={
                    getCreditError(index)
                      ? `${idPrefix}-${type}-deadline-${index}-credit-error`
                      : undefined
                  }
                  placeholder={isEarly ? '120' : '80'}
                  min={isEarly ? clampCredit(dueCredit + 1, 'early') : '0'}
                  max={run(() => {
                    const previousCredit = index > 0 ? deadlines[index - 1]?.credit : undefined;
                    if (previousCredit != null && Number.isFinite(previousCredit)) {
                      return clampCredit(previousCredit - 1, type);
                    }
                    return type === 'early' ? 200 : clampCredit(dueCredit - 1, 'late');
                  })}
                  step={1}
                  disabled={!ruleEditable}
                  {...register(`${fieldArrayName}.${index}.credit`, {
                    valueAsNumber: true,
                  })}
                />
                <InputGroup.Text>%</InputGroup.Text>
              </InputGroup>
              {ruleEditable && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  aria-label={`Remove ${isEarly ? 'early' : 'late'} deadline ${index + 1}`}
                  onClick={() => removeDeadline(index)}
                >
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              )}
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
  const ruleEditable = useAccessControlRuleEditable();
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

  const addEarlyDisabledTitle = isEarly ? getAddEarlyDisabledTitle(effectiveDueCredit) : undefined;
  const addLimitDisabledTitle = getDeadlineLimitDisabledTitle(type, fields.length);
  const addDisabledTitle = addEarlyDisabledTitle ?? addLimitDisabledTitle;
  const addEarlyDisabled = addEarlyDisabledTitle !== undefined;
  const addDisabled = addDisabledTitle !== undefined;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label={label}
      headerToggle={
        <ToggleTitle
          id={`${idPrefix}-${type}-deadlines-enabled`}
          label={label}
          checked={fields.length > 0}
          disabled={!ruleEditable || (addEarlyDisabled && fields.length === 0)}
          title={addEarlyDisabled && fields.length === 0 ? addEarlyDisabledTitle : undefined}
          onChange={(checked) => {
            if (checked) {
              append(nextDeadline());
            } else {
              remove();
            }
          }}
        />
      }
      headerAction={
        ruleEditable ? (
          <Button
            size="sm"
            variant="outline-primary"
            disabled={addDisabled}
            title={addDisabledTitle}
            onClick={() => append(nextDeadline())}
          >
            Add {isEarly ? 'early' : 'late'}
          </Button>
        ) : undefined
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
          defaults or earlier overrides.
          {ruleEditable && <> Click "Remove override" to inherit them instead.</>}
        </Alert>
      )}
      <DeadlineArrayInput
        type={type}
        fieldArrayName={fieldArrayName}
        idPrefix={idPrefix}
        releaseDate={effectiveReleaseDate}
        dueDate={effectiveDueDate}
        dueCredit={effectiveDueCredit}
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
