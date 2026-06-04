import { Temporal } from '@js-temporal/polyfill';
import { useEffect } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import { isOverrideFieldActive, validateActiveOverrideField } from '../overrideFields.js';
import type { AccessControlFormData, DeadlineEntry, DueValue } from '../types.js';
import { endOfDayDatetime, getLatestDeadlineEntry } from '../utils/dateUtils.js';

function DueDateInput({
  value,
  onChange,
  idPrefix,
  releaseDate,
  earlyDeadlines,
  dateError,
  creditError,
  displayTimezone,
}: {
  value: DueValue;
  onChange: (value: DueValue) => void;
  idPrefix: string;
  releaseDate: string | null | undefined;
  earlyDeadlines: DeadlineEntry[] | undefined;
  dateError?: string;
  creditError?: string;
  displayTimezone: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const effectiveCredit = value.credit ?? 100;

  const getCreditPeriodText = () => {
    if (!value.date) return null;

    const dueDatePlain = Temporal.PlainDateTime.from(value.date);
    const latestEarly = earlyDeadlines ? getLatestDeadlineEntry(earlyDeadlines) : null;
    const friendly = (date: Date | Temporal.PlainDateTime) => (
      <FriendlyDate date={date} timezone={displayTimezone} options={{ includeTz: false }} />
    );

    const startNode = latestEarly
      ? friendly(latestEarly)
      : releaseDate
        ? friendly(Temporal.PlainDateTime.from(releaseDate))
        : null;
    if (!startNode) return null;

    return (
      <>
        {startNode} – {friendly(dueDatePlain)} ({effectiveCredit}% credit)
      </>
    );
  };

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-never`}
          label="No due date"
          checked={value.date === null}
          disabled={!ruleEditable}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ ...value, date: null });
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-on-date`}
          label="Due on date"
          checked={value.date !== null}
          disabled={!ruleEditable}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              const latestEarlyDate = earlyDeadlines?.at(-1)?.date;
              let baseDate: Temporal.PlainDate;
              if (latestEarlyDate) {
                baseDate = Temporal.PlainDateTime.from(latestEarlyDate).toPlainDate();
              } else if (releaseDate) {
                baseDate = Temporal.PlainDateTime.from(releaseDate).toPlainDate();
              } else {
                baseDate = Temporal.Now.plainDateISO(displayTimezone);
              }
              onChange({
                ...value,
                date: endOfDayDatetime(baseDate.add({ weeks: 1 })),
              });
            }
          }}
        />
      </div>
      {value.date !== null && (
        <>
          <Form.Control
            type="datetime-local"
            step={1}
            aria-label="Due date"
            aria-invalid={!!dateError}
            aria-errormessage={dateError ? `${idPrefix}-due-date-error` : undefined}
            value={value.date}
            disabled={!ruleEditable}
            onChange={({ currentTarget }) => onChange({ ...value, date: currentTarget.value })}
          />
          {dateError && (
            <Form.Text id={`${idPrefix}-due-date-error`} className="text-danger" role="alert">
              {dateError}
            </Form.Text>
          )}
          {!dateError && value.date && (
            <Form.Text className="text-muted">{getCreditPeriodText()}</Form.Text>
          )}
        </>
      )}
      <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
        {!value.customCredit ? (
          <span className="text-muted small">
            100% credit (default)
            {ruleEditable && (
              <>
                {' '}
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 align-baseline"
                  onClick={() => onChange({ ...value, customCredit: true, credit: 100 })}
                >
                  Change
                </Button>
              </>
            )}
          </span>
        ) : (
          <>
            <label
              htmlFor={`${idPrefix}-due-credit`}
              className="form-label mb-0 small text-body-secondary"
            >
              Credit
            </label>
            <InputGroup style={{ width: 'auto', flex: '0 0 auto' }}>
              <Form.Control
                id={`${idPrefix}-due-credit`}
                type="number"
                min={0}
                max={200}
                step={1}
                style={{ width: '6rem' }}
                aria-label="Due date credit percentage"
                aria-invalid={!!creditError}
                aria-errormessage={creditError ? `${idPrefix}-due-credit-error` : undefined}
                value={value.credit ?? ''}
                placeholder="100"
                disabled={!ruleEditable}
                onChange={({ currentTarget }) => {
                  const raw = currentTarget.value;
                  const parsed = raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
                  onChange({ ...value, credit: parsed });
                }}
              />
              <InputGroup.Text>%</InputGroup.Text>
            </InputGroup>
            {ruleEditable && (
              <Button
                variant="link"
                size="sm"
                className="p-0"
                onClick={() => onChange({ ...value, customCredit: false, credit: null })}
              >
                Reset to default
              </Button>
            )}
          </>
        )}
      </div>
      {creditError && (
        <Form.Text id={`${idPrefix}-due-credit-error`} className="text-danger d-block" role="alert">
          {creditError}
        </Form.Text>
      )}
    </Form.Group>
  );
}

function validateDueDate(
  date: string | null,
  releaseDate: string | null | undefined,
): string | undefined {
  if (date === null) return undefined;
  if (!date) return 'Date is required';
  if (releaseDate && new Date(date) <= new Date(releaseDate)) {
    return 'Due date must be after the release date';
  }
  return undefined;
}

function validateDueCredit(credit: number | null, customCredit: boolean): string | undefined {
  if (credit === null) {
    if (customCredit) return 'Credit is required';
    return undefined;
  }
  if (!Number.isFinite(credit)) return 'Credit must be a finite number';
  if (!Number.isInteger(credit)) return 'Credit must be an integer';
  if (credit < 0 || credit > 200) return 'Credit must be between 0% and 200%';
  return undefined;
}

export function DefaultDueDateField({ displayTimezone }: { displayTimezone: string }) {
  const { trigger } = useFormContext<AccessControlFormData>();
  const releaseDate = useWatch<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });

  const earlyDeadlines = useWatch<AccessControlFormData, 'defaultRule.earlyDeadlines'>({
    name: 'defaultRule.earlyDeadlines',
  });

  const customCreditCtrl = useController<AccessControlFormData, 'defaultRule.due.customCredit'>({
    name: 'defaultRule.due.customCredit',
  });

  const dateCtrl = useController<AccessControlFormData, 'defaultRule.due.date'>({
    name: 'defaultRule.due.date',
    rules: {
      validate: (value, formValues) =>
        validateDueDate(value, formValues.defaultRule.release.date) ?? true,
    },
  });
  const creditCtrl = useController<AccessControlFormData, 'defaultRule.due.credit'>({
    name: 'defaultRule.due.credit',
    rules: {
      validate: (value, formValues) =>
        validateDueCredit(value, formValues.defaultRule.due.customCredit) ?? true,
    },
  });

  const value: DueValue = {
    date: dateCtrl.field.value,
    credit: creditCtrl.field.value,
    customCredit: customCreditCtrl.field.value,
  };

  // Re-validate the due date whenever the release date changes so the
  // cross-field error message updates without the user touching the due
  // date input.
  useEffect(() => {
    void trigger('defaultRule.due.date');
  }, [releaseDate, trigger]);

  const handleChange = (next: DueValue) => {
    if (next.date !== value.date) dateCtrl.field.onChange(next.date);
    if (next.customCredit !== value.customCredit) {
      customCreditCtrl.field.onChange(next.customCredit);
    }
    if (next.credit !== value.credit) creditCtrl.field.onChange(next.credit);
  };

  return (
    <div>
      <Form.Label className="fw-bold">Due date</Form.Label>
      <DueDateInput
        value={value}
        idPrefix="defaultRule"
        releaseDate={releaseDate}
        earlyDeadlines={earlyDeadlines}
        dateError={dateCtrl.fieldState.error?.message}
        creditError={creditCtrl.fieldState.error?.message}
        displayTimezone={displayTimezone}
        onChange={handleChange}
      />
    </div>
  );
}

export function OverrideDueDateField({
  index,
  displayTimezone,
}: {
  index: number;
  displayTimezone: string;
}) {
  const { trigger } = useFormContext<AccessControlFormData>();
  const defaultRuleValue = useWatch<AccessControlFormData, 'defaultRule.due'>({
    name: 'defaultRule.due',
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'due');

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'release');
  const releaseDate = useWatch<AccessControlFormData, `overrides.${number}.release.date`>({
    name: `overrides.${index}.release.date`,
  });
  const defaultRuleReleaseDate = useWatch<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });

  const { isOverridden: earlyDeadlinesOverridden } = useOverrideField(index, 'earlyDeadlines');
  const earlyDeadlines = useWatch<AccessControlFormData, `overrides.${number}.earlyDeadlines`>({
    name: `overrides.${index}.earlyDeadlines`,
  });
  const defaultRuleEarlyDeadlines = useWatch<AccessControlFormData, 'defaultRule.earlyDeadlines'>({
    name: 'defaultRule.earlyDeadlines',
  });

  const effectiveReleaseDate = releaseDateOverridden ? releaseDate : defaultRuleReleaseDate;
  const validationReleaseDate = releaseDateOverridden ? releaseDate : undefined;

  const customCreditCtrl = useController<
    AccessControlFormData,
    `overrides.${number}.due.customCredit`
  >({
    name: `overrides.${index}.due.customCredit`,
  });

  const dateCtrl = useController<AccessControlFormData, `overrides.${number}.due.date`>({
    name: `overrides.${index}.due.date`,
    rules: {
      validate: validateActiveOverrideField(index, 'due', (value, formValues) => {
        const overrideReleaseDate = isOverrideFieldActive(formValues, index, 'release')
          ? formValues.overrides[index]?.release.date
          : undefined;
        return validateDueDate(value, overrideReleaseDate) ?? true;
      }),
    },
  });
  const creditCtrl = useController<AccessControlFormData, `overrides.${number}.due.credit`>({
    name: `overrides.${index}.due.credit`,
    rules: {
      validate: validateActiveOverrideField(
        index,
        'due',
        (value, formValues) =>
          validateDueCredit(value, formValues.overrides[index]?.due.customCredit ?? false) ?? true,
      ),
    },
  });

  const value: DueValue = {
    date: dateCtrl.field.value,
    credit: creditCtrl.field.value,
    customCredit: customCreditCtrl.field.value,
  };

  // Re-validate the due date whenever the effective release date changes so
  // the cross-field error message updates without the user touching the due
  // date input.
  useEffect(() => {
    void trigger(`overrides.${index}.due.date`);
  }, [index, validationReleaseDate, trigger]);

  const handleChange = (next: DueValue) => {
    if (next.date !== value.date) dateCtrl.field.onChange(next.date);
    if (next.customCredit !== value.customCredit) {
      customCreditCtrl.field.onChange(next.customCredit);
    }
    if (next.credit !== value.credit) creditCtrl.field.onChange(next.credit);
  };

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Due date"
      onOverride={() => {
        dateCtrl.field.onChange(defaultRuleValue.date);
        creditCtrl.field.onChange(defaultRuleValue.credit);
        customCreditCtrl.field.onChange(defaultRuleValue.customCredit);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DueDateInput
        value={value}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        earlyDeadlines={earlyDeadlinesOverridden ? earlyDeadlines : defaultRuleEarlyDeadlines}
        dateError={dateCtrl.fieldState.error?.message}
        creditError={creditCtrl.fieldState.error?.message}
        displayTimezone={displayTimezone}
        onChange={handleChange}
      />
    </FieldWrapper>
  );
}
