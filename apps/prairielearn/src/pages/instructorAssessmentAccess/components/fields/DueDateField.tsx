import { Temporal } from '@js-temporal/polyfill';
import { useState } from 'react';
import { Alert, Button, Form, InputGroup } from 'react-bootstrap';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import { formatDateFriendly } from '@prairielearn/formatter';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { getAssessmentSettingsUrl } from '../../../../lib/client/url.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry, DueValue } from '../types.js';
import { endOfDayDatetime, getLatestDeadlineEntry } from '../utils/dateUtils.js';

function localDatetimeToTimezoneDate(value: string, timezone: string): Date {
  return new Date(Temporal.PlainDateTime.from(value).toZonedDateTime(timezone).epochMilliseconds);
}

function formatCourseLocalDate(value: string, displayTimezone: string): string {
  return formatDateFriendly(localDatetimeToTimezoneDate(value, displayTimezone), displayTimezone, {
    dateOnly: true,
    includeTz: false,
  });
}

function DueDateInput({
  value,
  onChange,
  isCreditCustom,
  onCreditCustomChange,
  idPrefix,
  releaseDate,
  earlyDeadlines,
  dateError,
  creditError,
  displayTimezone,
  assessmentId,
  courseInstanceId,
}: {
  value: DueValue;
  onChange: (value: DueValue) => void;
  isCreditCustom: boolean;
  onCreditCustomChange: (v: boolean) => void;
  idPrefix: string;
  releaseDate: string | null | undefined;
  earlyDeadlines: DeadlineEntry[] | undefined;
  dateError?: string;
  creditError?: string;
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const effectiveCredit = value.credit ?? 100;

  const getCreditPeriodText = () => {
    if (!value.date) return null;

    const dueDatePlain = Temporal.PlainDateTime.from(value.date);
    const latestEarly = earlyDeadlines ? getLatestDeadlineEntry(earlyDeadlines) : null;
    const creditLabel = `(${effectiveCredit}% credit)`;

    if (latestEarly) {
      return (
        <>
          <FriendlyDate
            date={latestEarly}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />{' '}
          –{' '}
          <FriendlyDate
            date={dueDatePlain}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />{' '}
          {creditLabel}
        </>
      );
    } else if (releaseDate) {
      const releaseDatePlain = Temporal.PlainDateTime.from(releaseDate);
      return (
        <>
          <FriendlyDate
            date={releaseDatePlain}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />{' '}
          –{' '}
          <FriendlyDate
            date={dueDatePlain}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />{' '}
          {creditLabel}
        </>
      );
    } else {
      return (
        <>
          While accessible –{' '}
          <FriendlyDate
            date={dueDatePlain}
            timezone={displayTimezone}
            options={{ includeTz: false }}
          />{' '}
          {creditLabel}
        </>
      );
    }
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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ date: null, credit: value.credit });
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-on-date`}
          label="Due on date"
          checked={value.date !== null}
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
                date: endOfDayDatetime(baseDate.add({ weeks: 1 })),
                credit: value.credit,
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
            onChange={({ currentTarget }) =>
              onChange({ date: currentTarget.value, credit: value.credit })
            }
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
        {!isCreditCustom ? (
          <span className="text-muted small">
            100% credit (default){' '}
            <Button
              variant="link"
              size="sm"
              className="p-0 align-baseline"
              onClick={() => {
                onCreditCustomChange(true);
                onChange({ date: value.date, credit: 100 });
              }}
            >
              Change
            </Button>
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
                style={{ width: '5rem' }}
                aria-label="Due date credit percentage"
                aria-invalid={!!creditError}
                aria-errormessage={creditError ? `${idPrefix}-due-credit-error` : undefined}
                value={value.credit ?? ''}
                placeholder="100"
                onChange={({ currentTarget }) => {
                  const raw = currentTarget.value;
                  const parsed = raw === '' ? null : Number(raw);
                  onChange({ date: value.date, credit: parsed });
                }}
              />
              <InputGroup.Text>%</InputGroup.Text>
            </InputGroup>
            <Button
              variant="link"
              size="sm"
              className="p-0"
              onClick={() => {
                onCreditCustomChange(false);
                onChange({ date: value.date, credit: null });
              }}
            >
              Reset to default
            </Button>
          </>
        )}
      </div>
      {creditError && (
        <Form.Text id={`${idPrefix}-due-credit-error`} className="text-danger d-block" role="alert">
          {creditError}
        </Form.Text>
      )}
      {value.credit !== null && value.credit > 100 && (
        <Alert variant="secondary" className="py-2 mt-2 mb-0">
          Date control is meant to reward earlier submissions. Consider using{' '}
          <Alert.Link href={getAssessmentSettingsUrl({ assessmentId, courseInstanceId })}>
            bonus points
          </Alert.Link>{' '}
          to make the assessment worth more.
        </Alert>
      )}
    </Form.Group>
  );
}

function validateDueDate(
  date: string | null,
  releaseDate: string | null | undefined,
  displayTimezone: string,
): string | undefined {
  if (date === null) return undefined;
  if (!date) return 'Date is required';
  if (releaseDate && new Date(date) <= new Date(releaseDate)) {
    return `Must be after release date (${formatCourseLocalDate(releaseDate, displayTimezone)})`;
  }
  return undefined;
}

function validateDueCredit(credit: number | null, isCustom: boolean): string | undefined {
  if (credit === null) {
    if (isCustom) return 'Credit is required';
    return undefined;
  }
  if (!Number.isFinite(credit)) return 'Credit must be a number';
  if (!Number.isInteger(credit)) return 'Credit must be an integer';
  if (credit < 0 || credit > 200) return 'Credit must be between 0% and 200%';
  return undefined;
}

export function MainDueDateField({
  displayTimezone,
  assessmentId,
  courseInstanceId,
}: {
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const { getValues } = useFormContext<AccessControlFormData>();

  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const earlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  const [isCreditCustom, setIsCreditCustom] = useState(
    () => getValues('mainRule.due.credit') !== null,
  );

  const dateCtrl = useController<AccessControlFormData, 'mainRule.due.date'>({
    name: 'mainRule.due.date',
    rules: {
      validate: (value) => validateDueDate(value, releaseDate, displayTimezone) ?? true,
    },
  });
  const creditCtrl = useController<AccessControlFormData, 'mainRule.due.credit'>({
    name: 'mainRule.due.credit',
    rules: {
      validate: (value) => validateDueCredit(value, isCreditCustom) ?? true,
    },
  });

  const value: DueValue = { date: dateCtrl.field.value, credit: creditCtrl.field.value };
  const handleChange = (next: DueValue) => {
    if (next.date !== value.date) dateCtrl.field.onChange(next.date);
    if (next.credit !== value.credit) creditCtrl.field.onChange(next.credit);
  };

  return (
    <div>
      <Form.Label className="fw-bold">Due date</Form.Label>
      <DueDateInput
        value={value}
        isCreditCustom={isCreditCustom}
        idPrefix="mainRule"
        releaseDate={releaseDate}
        earlyDeadlines={earlyDeadlines}
        dateError={dateCtrl.fieldState.error?.message}
        creditError={creditCtrl.fieldState.error?.message}
        displayTimezone={displayTimezone}
        assessmentId={assessmentId}
        courseInstanceId={courseInstanceId}
        onCreditCustomChange={setIsCreditCustom}
        onChange={handleChange}
      />
    </div>
  );
}

export function OverrideDueDateField({
  index,
  displayTimezone,
  assessmentId,
  courseInstanceId,
}: {
  index: number;
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const { getValues } = useFormContext<AccessControlFormData>();

  const mainValue = useWatch<AccessControlFormData, 'mainRule.due'>({
    name: 'mainRule.due',
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'due');

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'releaseDate');
  const releaseDate = useWatch<AccessControlFormData, `overrides.${number}.releaseDate`>({
    name: `overrides.${index}.releaseDate`,
  });
  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const { isOverridden: earlyDeadlinesOverridden } = useOverrideField(index, 'earlyDeadlines');
  const earlyDeadlines = useWatch<AccessControlFormData, `overrides.${number}.earlyDeadlines`>({
    name: `overrides.${index}.earlyDeadlines`,
  });
  const mainEarlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  const effectiveReleaseDate = releaseDateOverridden ? releaseDate : mainReleaseDate;
  const validationReleaseDate = releaseDateOverridden ? releaseDate : undefined;

  const [isCreditCustom, setIsCreditCustom] = useState(
    () => getValues(`overrides.${index}.due.credit`) !== null,
  );

  const dateCtrl = useController<AccessControlFormData, `overrides.${number}.due.date`>({
    name: `overrides.${index}.due.date`,
    rules: {
      validate: (value) => validateDueDate(value, validationReleaseDate, displayTimezone) ?? true,
    },
  });
  const creditCtrl = useController<AccessControlFormData, `overrides.${number}.due.credit`>({
    name: `overrides.${index}.due.credit`,
    rules: {
      validate: (value) => validateDueCredit(value, isCreditCustom) ?? true,
    },
  });

  const value: DueValue = { date: dateCtrl.field.value, credit: creditCtrl.field.value };
  const handleChange = (next: DueValue) => {
    if (next.date !== value.date) dateCtrl.field.onChange(next.date);
    if (next.credit !== value.credit) creditCtrl.field.onChange(next.credit);
  };

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Due date"
      headerContent={<strong>Due date</strong>}
      onOverride={() => {
        dateCtrl.field.onChange(mainValue.date);
        creditCtrl.field.onChange(mainValue.credit);
        setIsCreditCustom(mainValue.credit !== null);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DueDateInput
        value={value}
        isCreditCustom={isCreditCustom}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        earlyDeadlines={earlyDeadlinesOverridden ? earlyDeadlines : mainEarlyDeadlines}
        dateError={dateCtrl.fieldState.error?.message}
        creditError={creditCtrl.fieldState.error?.message}
        displayTimezone={displayTimezone}
        assessmentId={assessmentId}
        courseInstanceId={courseInstanceId}
        onCreditCustomChange={setIsCreditCustom}
        onChange={handleChange}
      />
    </FieldWrapper>
  );
}
