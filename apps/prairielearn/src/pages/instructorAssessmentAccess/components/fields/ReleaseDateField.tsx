import { Temporal } from '@js-temporal/polyfill';
import { Button, Form } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';

function todayLocalDatetime(): string {
  return Temporal.Now.plainDateISO().toPlainDateTime().toString({ smallestUnit: 'minute' });
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
            if (currentTarget.checked) onChange('');
          }}
        />
      </div>
      {value !== null && (
        <Form.Control
          type="datetime-local"
          aria-label="Release date"
          value={value}
          onChange={({ currentTarget }) => onChange(currentTarget.value)}
        />
      )}
    </Form.Group>
  );
}

export function MainReleaseDateField() {
  const { field } = useController<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2">
        <strong>Release date</strong>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => field.onChange(todayLocalDatetime())}
        >
          Today
        </Button>
      </div>
      <Form.Control
        type="datetime-local"
        aria-label="Release date"
        value={field.value ?? ''}
        onChange={({ currentTarget }) => field.onChange(currentTarget.value || null)}
      />
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
