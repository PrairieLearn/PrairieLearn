import { Temporal } from '@js-temporal/polyfill';
import { Form } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';
import { startOfDayDatetime, tomorrowDate } from '../utils/dateUtils.js';

function todayLocalDatetime(): string {
  return startOfDayDatetime();
}

function tomorrowLocalDatetime(): string {
  return startOfDayDatetime(tomorrowDate());
}

function isReleasedNow(value: string): boolean {
  if (!value) return true;
  try {
    const release = Temporal.PlainDateTime.from(value);
    const now = Temporal.Now.plainDateTimeISO();
    return Temporal.PlainDateTime.compare(release, now) <= 0;
  } catch {
    return true;
  }
}

function MainReleaseDateInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const released = isReleasedNow(value);

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name="mainRule-releaseMode"
          id="mainRule-release-now"
          label="Released"
          checked={released}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChange(todayLocalDatetime());
            }
          }}
        />
        <Form.Check
          type="radio"
          name="mainRule-releaseMode"
          id="mainRule-release-scheduled"
          label="Scheduled for release"
          checked={!released}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChange(tomorrowLocalDatetime());
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
            aria-errormessage={error ? 'mainRule-release-date-error' : undefined}
            value={value}
            onChange={({ currentTarget }) => onChange(currentTarget.value)}
          />
          {error && (
            <Form.Text id="mainRule-release-date-error" className="text-danger" role="alert">
              {error}
            </Form.Text>
          )}
        </>
      )}
    </Form.Group>
  );
}

function OverrideReleaseDateInput({
  value,
  onChange,
  idPrefix,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}) {
  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-immediately`}
          label="Released immediately"
          checked={value === null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange(null);
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-after-date`}
          label="Released after date"
          checked={value !== null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange(tomorrowLocalDatetime());
          }}
        />
      </div>
      {value !== null && (
        <Form.Control
          type="datetime-local"
          step={1}
          aria-label="Release date"
          value={value}
          onChange={({ currentTarget }) => onChange(currentTarget.value)}
        />
      )}
    </Form.Group>
  );
}

export function MainReleaseDateField() {
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
      <strong className="d-block mb-2">Release date</strong>
      <MainReleaseDateInput value={field.value} error={error?.message} onChange={field.onChange} />
    </div>
  );
}

export function OverrideReleaseDateField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const { field } = useController({
    name: `overrides.${index}.releaseDate` as Path<AccessControlFormData>,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'releaseDate');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Release date"
      headerContent={<strong>Release date</strong>}
      onOverride={() => {
        field.onChange(mainValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <OverrideReleaseDateInput
        value={field.value as string | null}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
