import { useEffect } from 'react';
import { Form } from 'react-bootstrap';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import { type AccessControlFormData, isReleasedNow } from '../types.js';
import { startOfDayDatetime, todayDate, tomorrowDate } from '../utils/dateUtils.js';

function todayLocalDatetime(displayTimezone: string): string {
  return startOfDayDatetime(todayDate(displayTimezone));
}

function tomorrowLocalDatetime(displayTimezone: string): string {
  return startOfDayDatetime(tomorrowDate(displayTimezone));
}

function ReleaseDateInput({
  date,
  released,
  onChangeDate,
  onChangeReleased,
  error,
  idPrefix,
  displayTimezone,
}: {
  date: string | null;
  released: boolean;
  onChangeDate: (value: string | null) => void;
  onChangeReleased: (value: boolean) => void;
  error?: string;
  idPrefix: string;
  displayTimezone: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-now`}
          label="Released"
          checked={released}
          disabled={!ruleEditable}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChangeReleased(true);
              // Snap the date into the past only when the current value
              // doesn't already fit "Released" (null or in the future), so
              // existing past dates are preserved.
              if (!date || !isReleasedNow(date, displayTimezone)) {
                onChangeDate(todayLocalDatetime(displayTimezone));
              }
            }
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-releaseMode`}
          id={`${idPrefix}-release-scheduled`}
          label="Scheduled for release"
          checked={!released}
          disabled={!ruleEditable}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              onChangeReleased(false);
              // Snap the date into the future only when the current value
              // doesn't already fit "Scheduled" (null or in the past), so
              // existing future dates are preserved.
              if (!date || isReleasedNow(date, displayTimezone)) {
                onChangeDate(tomorrowLocalDatetime(displayTimezone));
              }
            }
          }}
        />
      </div>
      <Form.Control
        type="datetime-local"
        step={1}
        aria-label="Release date"
        aria-invalid={!!error}
        aria-errormessage={error ? `${idPrefix}-release-date-error` : undefined}
        value={date ?? ''}
        disabled={!ruleEditable}
        onChange={({ currentTarget }) => onChangeDate(currentTarget.value)}
      />
      {error && (
        <Form.Text id={`${idPrefix}-release-date-error`} className="text-danger" role="alert">
          {error}
        </Form.Text>
      )}
    </Form.Group>
  );
}

export function DefaultReleaseDateField({ displayTimezone }: { displayTimezone: string }) {
  const { trigger } = useFormContext<AccessControlFormData>();
  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });

  const {
    field: dateField,
    fieldState: { error },
  } = useController<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });

  // Re-run the validator when dateControlEnabled changes so the
  // "required" error appears/disappears immediately on toggle.
  useEffect(() => {
    void trigger('defaultRule.release.date');
  }, [dateControlEnabled, trigger]);

  const { field: releasedField } = useController<
    AccessControlFormData,
    'defaultRule.release.released'
  >({ name: 'defaultRule.release.released' });

  return (
    <div>
      <strong className="d-block mb-2">Release</strong>
      <ReleaseDateInput
        date={dateField.value}
        released={releasedField.value}
        error={error?.message}
        idPrefix="defaultRule"
        displayTimezone={displayTimezone}
        onChangeDate={dateField.onChange}
        onChangeReleased={releasedField.onChange}
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
  const defaultRuleValue = useWatch<AccessControlFormData, 'defaultRule.release.date'>({
    name: 'defaultRule.release.date',
  });

  const {
    field: dateField,
    fieldState: { error },
  } = useController<AccessControlFormData, `overrides.${number}.release.date`>({
    name: `overrides.${index}.release.date`,
  });

  const { field: releasedField } = useController<
    AccessControlFormData,
    `overrides.${number}.release.released`
  >({
    name: `overrides.${index}.release.released`,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'release');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Release"
      onOverride={() => {
        const date = defaultRuleValue || todayLocalDatetime(displayTimezone);
        dateField.onChange(date);
        releasedField.onChange(isReleasedNow(date, displayTimezone));
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <ReleaseDateInput
        date={dateField.value}
        released={releasedField.value}
        error={error?.message}
        idPrefix={`overrides-${index}`}
        displayTimezone={displayTimezone}
        onChangeDate={dateField.onChange}
        onChangeReleased={releasedField.onChange}
      />
    </FieldWrapper>
  );
}
