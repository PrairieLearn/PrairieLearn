import { Temporal } from '@js-temporal/polyfill';
import { Alert, Button, Form, InputGroup } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { formatDateFriendly } from '@prairielearn/formatter';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
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
  idPrefix,
  releaseDate,
  earlyDeadlines,
  hasLateDeadlines,
  dateError,
  creditError,
  displayTimezone,
}: {
  value: DueValue;
  onChange: (value: DueValue) => void;
  idPrefix: string;
  releaseDate: string | null | undefined;
  earlyDeadlines: DeadlineEntry[] | undefined;
  hasLateDeadlines: boolean;
  dateError?: string;
  creditError?: string;
  displayTimezone: string;
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
        {value.credit === null ? (
          <span className="text-muted small">
            100% credit (default){' '}
            <Button
              variant="link"
              size="sm"
              className="p-0 align-baseline"
              onClick={() => onChange({ date: value.date, credit: 100 })}
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
              onClick={() => onChange({ date: value.date, credit: null })}
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
      {value.credit !== null && value.credit !== 100 && (
        <Alert variant="warning" className="py-2 mt-2 mb-0">
          Early deadlines are disabled when using custom credit for a due date.
        </Alert>
      )}
      {value.credit !== null && value.credit > 100 && hasLateDeadlines && (
        <Alert variant="secondary" className="py-2 mt-2 mb-0">
          We recommend using bonus points on an assessment for extra credit, rather than giving
          extra credit on the due date.
        </Alert>
      )}
    </Form.Group>
  );
}

function validateDueDate(
  value: DueValue,
  releaseDate: string | null | undefined,
  displayTimezone: string,
): string | undefined {
  if (value.date === null) return undefined;
  if (!value.date) return 'Date is required';
  if (releaseDate && new Date(value.date) <= new Date(releaseDate)) {
    return `Must be after release date (${formatCourseLocalDate(releaseDate, displayTimezone)})`;
  }
  return undefined;
}

function validateDueCredit(value: DueValue): string | undefined {
  if (value.credit === null) return undefined;
  if (!Number.isFinite(value.credit)) return 'Credit must be a number';
  if (!Number.isInteger(value.credit)) return 'Credit must be an integer';
  if (value.credit < 0 || value.credit > 200) return 'Credit must be between 0% and 200%';
  return undefined;
}

export function MainDueDateField({ displayTimezone }: { displayTimezone: string }) {
  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const earlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  const lateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });

  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, 'mainRule.due'>({
    name: 'mainRule.due',
    rules: {
      validate: (value) => {
        return (
          validateDueDate(value, releaseDate, displayTimezone) ?? validateDueCredit(value) ?? true
        );
      },
    },
  });

  const dateError = error?.message?.includes('Credit') ? undefined : error?.message;
  const creditError = error?.message?.includes('Credit') ? error.message : undefined;

  return (
    <div>
      <Form.Label className="fw-bold">Due date</Form.Label>
      <DueDateInput
        value={field.value}
        idPrefix="mainRule"
        releaseDate={releaseDate}
        earlyDeadlines={earlyDeadlines}
        hasLateDeadlines={lateDeadlines.length > 0}
        dateError={dateError}
        creditError={creditError}
        displayTimezone={displayTimezone}
        onChange={field.onChange}
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

  const { isOverridden: lateDeadlinesOverridden } = useOverrideField(index, 'lateDeadlines');
  const lateDeadlines = useWatch<AccessControlFormData, `overrides.${number}.lateDeadlines`>({
    name: `overrides.${index}.lateDeadlines`,
  });
  const mainLateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });

  const effectiveReleaseDate = releaseDateOverridden ? releaseDate : mainReleaseDate;
  const validationReleaseDate = releaseDateOverridden ? releaseDate : undefined;
  const effectiveLateDeadlines = lateDeadlinesOverridden ? lateDeadlines : mainLateDeadlines;

  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, `overrides.${number}.due`>({
    name: `overrides.${index}.due`,
    rules: {
      validate: (value) => {
        return (
          validateDueDate(value, validationReleaseDate, displayTimezone) ??
          validateDueCredit(value) ??
          true
        );
      },
    },
  });

  const dateError = error?.message?.includes('Credit') ? undefined : error?.message;
  const creditError = error?.message?.includes('Credit') ? error.message : undefined;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Due date"
      headerContent={<strong>Due date</strong>}
      onOverride={() => {
        field.onChange({ ...mainValue });
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DueDateInput
        value={field.value}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        earlyDeadlines={earlyDeadlinesOverridden ? earlyDeadlines : mainEarlyDeadlines}
        hasLateDeadlines={effectiveLateDeadlines.length > 0}
        dateError={dateError}
        creditError={creditError}
        displayTimezone={displayTimezone}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
