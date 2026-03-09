import { Form } from 'react-bootstrap';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { NamePrefix } from '../hooks/useTypedFormWatch.js';

interface ReleaseDateFieldProps {
  namePrefix: NamePrefix;
}

export function ReleaseDateField({ namePrefix }: ReleaseDateFieldProps) {
  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    namePrefix,
    fieldPath: 'dateControl.releaseDate',
    defaultValue: '',
    deps: ['dateControl.earlyDeadlines.value'],
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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setField({ isEnabled: true });
            }
          }}
        />
      </div>
      {field.isEnabled && (
        <Form.Control
          type="datetime-local"
          aria-label="Release date"
          value={field.value}
          onChange={({ currentTarget }) => {
            setField({ value: currentTarget.value });
          }}
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
