import { Temporal } from '@js-temporal/polyfill';
import { Form } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';
import { startOfDayDatetime, todayDate, tomorrowDate } from '../utils/dateUtils.js';

function todayLocalDatetime(displayTimezone: string): string {
  return startOfDayDatetime(todayDate(displayTimezone));
}

function tomorrowLocalDatetime(displayTimezone: string): string {
  return startOfDayDatetime(tomorrowDate(displayTimezone));
}

function isReleasedNow(value: string | null, displayTimezone: string): boolean {
  if (!value) return true;
  const release = Temporal.PlainDateTime.from(value);
  const now = Temporal.Now.plainDateTimeISO(displayTimezone);
  return Temporal.PlainDateTime.compare(release, now) <= 0;
}

function ReleaseDateInput({
  value,
  onChange,
  error,
  idPrefix,
  displayTimezone,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  idPrefix: string;
  displayTimezone: string;
}) {
  const released = isReleasedNow(value, displayTimezone);

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-now`}
          label="Released"
          checked={released}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChange(todayLocalDatetime(displayTimezone));
            }
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-scheduled`}
          label="Scheduled for release"
          checked={!released}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChange(tomorrowLocalDatetime(displayTimezone));
            }
          }}
        />
      </div>
      {!released && (
        <>
          <Form.Control
            type="datetime-local"
            step={1}
            aria-label="Release date"
            aria-invalid={!!error}
            aria-errormessage={error ? `${idPrefix}-release-date-error` : undefined}
            value={value ?? ''}
            onChange={({ currentTarget }) => onChange(currentTarget.value)}
          />
          {error && (
            <Form.Text id={`${idPrefix}-release-date-error`} className="text-danger" role="alert">
              {error}
            </Form.Text>
          )}
        </>
      )}
    </Form.Group>
  );
}

export function MainReleaseDateField({ displayTimezone }: { displayTimezone: string }) {
  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });

  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
    rules: {
      validate: (value) => {
        if (!dateControlEnabled) return true;
        if (!value) return 'Release date is required';
        return true;
      },
    },
  });

  return (
    <div>
      <strong className="d-block mb-2">Release</strong>
      <ReleaseDateInput
        value={field.value}
        error={error?.message}
        idPrefix="mainRule"
        displayTimezone={displayTimezone}
        onChange={field.onChange}
      />
    </div>
  );
}

export function OverrideReleaseDateField({
  index,
  displayTimezone,
}: {
  index: number;
  displayTimezone: string;
}) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const { field } = useController<AccessControlFormData, `overrides.${number}.releaseDate`>({
    name: `overrides.${index}.releaseDate`,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'releaseDate');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Release"
      headerContent={<strong>Release</strong>}
      onOverride={() => {
        field.onChange(mainValue || todayLocalDatetime(displayTimezone));
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <ReleaseDateInput
        value={field.value}
        idPrefix={`overrides-${index}`}
        displayTimezone={displayTimezone}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
