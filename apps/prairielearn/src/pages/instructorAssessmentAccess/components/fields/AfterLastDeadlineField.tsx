import { Form, InputGroup } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type {
  AccessControlFormData,
  AfterLastDeadlineValue,
  DeadlineEntry,
  OverridableField,
} from '../types.js';
import { getLastDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface AfterLastDeadlineFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

export function AfterLastDeadlineField({
  control,
  setValue,
  namePrefix,
}: AfterLastDeadlineFieldProps) {
  const userTimezone = getUserTimezone();

  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    control,
    setValue,
    namePrefix,
    fieldPath: 'dateControl.afterLastDeadline',
    defaultValue: {} as AfterLastDeadlineValue,
  });

  // Watch due date and late deadlines for calculating last deadline text
  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDate` as any,
  }) as OverridableField<string> | undefined;

  const lateDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlines` as any,
  }) as OverridableField<DeadlineEntry[]> | undefined;

  // Determine the current mode based on field values
  const getMode = (): AfterLastDeadlineMode => {
    const { allowSubmissions, credit } = field.value;
    if (!allowSubmissions) return 'no_submissions';
    if (credit === undefined) return 'practice_submissions';
    return 'partial_credit';
  };

  const mode = getMode();

  // Get the last deadline text
  const getLastDeadlineText = () => {
    if (!dueDate || !lateDeadlines) return 'This will take effect after the last deadline';

    const lastDate = getLastDeadlineDate(lateDeadlines, dueDate);
    if (lastDate) {
      return (
        <>
          This will take effect after{' '}
          <FriendlyDate date={lastDate} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return 'This will take effect after the last deadline';
  };

  const content = (
    <Form.Group>
      <div class="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-afterLastDeadlineMode`}
          id={`${namePrefix}-after-deadline-no-submissions`}
          label="No submissions allowed"
          checked={mode === 'no_submissions'}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: true, value: { allowSubmissions: false } });
            }
          }}
        />
        <Form.Check
          type="radio"
          name={`${namePrefix}-afterLastDeadlineMode`}
          id={`${namePrefix}-after-deadline-practice-submissions`}
          label="Allow practice submissions"
          checked={mode === 'practice_submissions'}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: true, value: { allowSubmissions: true } });
            }
          }}
        />
        <Form.Text class="text-muted ms-4">No credit is given for practice submissions</Form.Text>
        <Form.Check
          type="radio"
          name={`${namePrefix}-afterLastDeadlineMode`}
          id={`${namePrefix}-after-deadline-partial-credit`}
          label="Allow submissions for partial credit"
          checked={mode === 'partial_credit'}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: true, value: { allowSubmissions: true, credit: 0 } });
            }
          }}
        />
      </div>

      {mode === 'partial_credit' && (
        <div class="ms-4">
          <InputGroup>
            <Form.Control
              type="number"
              min="0"
              max="200"
              placeholder="Credit percentage"
              value={field.value.credit ?? 0}
              onChange={(e) =>
                setField({
                  value: {
                    allowSubmissions: true,
                    credit: Number((e.target as HTMLInputElement).value) || 0,
                  },
                })
              }
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          <Form.Text class="text-muted">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );

  // Wrap with header that shows the last deadline text
  const wrappedContent = (
    <div>
      <div class="mb-2">
        <strong>After Last Deadline</strong>
        <br />
        <small class="text-muted">{getLastDeadlineText()}</small>
      </div>
      {content}
    </div>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="After Last Deadline"
      onOverride={() => enableOverride({ allowSubmissions: false })}
      onRemoveOverride={removeOverride}
    >
      {wrappedContent}
    </FieldWrapper>
  );
}
