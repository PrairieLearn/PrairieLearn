import { Form } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import type { AccessControlFormData } from '../types.js';

function formatInheritedDate(value: string | null): string {
  if (!value) return 'Released immediately';
  try {
    const date = new Date(value);
    return `After ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return `After ${value}`;
  }
}

interface ReleaseDateInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}

function ReleaseDateInput({ value, onChange, idPrefix }: ReleaseDateInputProps) {
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
      <strong>Release date</strong>
      <ReleaseDateInput value={field.value} idPrefix="mainRule" onChange={field.onChange} />
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

  const value = field.value as string | null | undefined;
  const isOverridden = value !== undefined;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Release date"
      inheritedValue={formatInheritedDate(mainValue)}
      headerContent={<strong>Release date</strong>}
      onOverride={() => field.onChange(mainValue)}
      onRemoveOverride={() => field.onChange(undefined)}
    >
      <ReleaseDateInput
        value={value as string | null}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
