import { Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { AccessControlFormData } from '../types.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface ReleaseDateFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

export function ReleaseDateField({ control, setValue, namePrefix }: ReleaseDateFieldProps) {
  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    control,
    setValue,
    namePrefix,
    fieldPath: 'dateControl.releaseDate',
    defaultValue: '',
  });

  const content = (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-releaseMode`}
          id={`${namePrefix}-release-immediately`}
          label="Released immediately"
          checked={!field.isEnabled}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: false });
            }
          }}
        />
        <Form.Check
          type="radio"
          name={`${namePrefix}-releaseMode`}
          id={`${namePrefix}-release-after-date`}
          label="Released after date"
          checked={field.isEnabled}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: true });
            }
          }}
        />
      </div>
      {field.isEnabled && (
        <Form.Control
          type="datetime-local"
          value={field.value}
          onChange={(e) => setField({ value: (e.target as HTMLInputElement).value })}
        />
      )}
    </Form.Group>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="Release date"
      headerContent={<strong>Release date</strong>}
      onOverride={() => enableOverride('')}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
