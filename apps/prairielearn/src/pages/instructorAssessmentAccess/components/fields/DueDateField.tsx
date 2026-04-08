import { Temporal } from '@js-temporal/polyfill';
import { Form } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import {
  endOfDayDatetime,
  getLatestEarlyDeadlineDate,
  getUserTimezone,
} from '../utils/dateUtils.js';

function DueDateInput({
  value,
  onChange,
  idPrefix,
  releaseDate,
  earlyDeadlines,
  error,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
  releaseDate: string | null | undefined;
  earlyDeadlines: DeadlineEntry[] | undefined;
  error?: string;
}) {
  const userTimezone = getUserTimezone();

  const getCreditPeriodText = () => {
    if (!value) return null;

    const dueDateObj = new Date(value);
    const latestEarly = earlyDeadlines ? getLatestEarlyDeadlineDate(earlyDeadlines) : null;

    if (latestEarly) {
      return (
        <>
          <FriendlyDate date={latestEarly} timezone={userTimezone} options={{ includeTz: false }} />{' '}
          –{' '}
          <FriendlyDate date={dueDateObj} timezone={userTimezone} options={{ includeTz: false }} />{' '}
          (100% credit)
        </>
      );
    } else if (releaseDate) {
      const releaseDateObj = new Date(releaseDate);
      return (
        <>
          <FriendlyDate
            date={releaseDateObj}
            timezone={userTimezone}
            options={{ includeTz: false }}
          />{' '}
          –{' '}
          <FriendlyDate date={dueDateObj} timezone={userTimezone} options={{ includeTz: false }} />{' '}
          (100% credit)
        </>
      );
    } else {
      return (
        <>
          While accessible –{' '}
          <FriendlyDate date={dueDateObj} timezone={userTimezone} options={{ includeTz: false }} />{' '}
          (100% credit)
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
          checked={value === null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange(null);
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-on-date`}
          label="Due on date"
          checked={value !== null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              const latestEarlyDate = earlyDeadlines?.filter((d) => d.date).pop()?.date;
              let baseDate: Temporal.PlainDate;
              if (latestEarlyDate) {
                baseDate = Temporal.PlainDateTime.from(latestEarlyDate).toPlainDate();
              } else if (releaseDate) {
                baseDate = Temporal.PlainDateTime.from(releaseDate).toPlainDate();
              } else {
                baseDate = Temporal.Now.plainDateISO();
              }
              onChange(endOfDayDatetime(baseDate.add({ weeks: 1 })));
            }
          }}
        />
      </div>
      {value !== null && (
        <>
          <Form.Control
            type="datetime-local"
            step={1}
            aria-label="Due date"
            aria-invalid={!!error}
            aria-errormessage={error ? `${idPrefix}-due-date-error` : undefined}
            value={value}
            onChange={({ currentTarget }) => onChange(currentTarget.value)}
          />
          {error && (
            <Form.Text id={`${idPrefix}-due-date-error`} className="text-danger" role="alert">
              {error}
            </Form.Text>
          )}
          {!error && value && <Form.Text className="text-muted">{getCreditPeriodText()}</Form.Text>}
        </>
      )}
    </Form.Group>
  );
}

export function MainDueDateField() {
  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const earlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
    rules: {
      validate: (value) => {
        if (value && releaseDate && new Date(value) <= new Date(releaseDate)) {
          return 'Due date must be after release date';
        }
        return true;
      },
    },
  });

  return (
    <div>
      <Form.Label className="fw-bold">Due date</Form.Label>
      <DueDateInput
        value={field.value}
        idPrefix="mainRule"
        releaseDate={releaseDate}
        earlyDeadlines={earlyDeadlines}
        error={error?.message}
        onChange={field.onChange}
      />
    </div>
  );
}

export function OverrideDueDateField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'dueDate');

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'releaseDate');
  const releaseDate = useWatch({
    name: `overrides.${index}.releaseDate` as Path<AccessControlFormData>,
  }) as string | null;
  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const { isOverridden: earlyDeadlinesOverridden } = useOverrideField(index, 'earlyDeadlines');
  const earlyDeadlines = useWatch({
    name: `overrides.${index}.earlyDeadlines` as Path<AccessControlFormData>,
  }) as DeadlineEntry[];
  const mainEarlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  const effectiveReleaseDate = releaseDateOverridden ? releaseDate : mainReleaseDate;

  const {
    field,
    fieldState: { error },
  } = useController({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
    rules: {
      validate: (value) => {
        const v = value as string | null;
        if (v && effectiveReleaseDate && new Date(v) <= new Date(effectiveReleaseDate)) {
          return 'Due date must be after release date';
        }
        return true;
      },
    },
  });

  const value = field.value as string | null;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Due date"
      headerContent={<strong>Due date</strong>}
      onOverride={() => {
        field.onChange(mainValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DueDateInput
        value={value}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        earlyDeadlines={earlyDeadlinesOverridden ? earlyDeadlines : mainEarlyDeadlines}
        error={error?.message}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
