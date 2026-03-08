import { Form, InputGroup } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import { type NamePrefix, useWatchOverridableField } from '../hooks/useTypedFormWatch.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

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
  const dueDate = useWatchOverridableField<string>(control, namePrefix, 'dateControl.dueDate');

  const lateDeadlines = useWatchOverridableField<DeadlineEntry[]>(
    control,
    namePrefix,
    'dateControl.lateDeadlines',
  );

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
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-afterLastDeadlineMode`}
          id={`${namePrefix}-after-deadline-no-submissions`}
          label="No submissions allowed"
          checked={mode === 'no_submissions'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setField({ isEnabled: true, value: { allowSubmissions: true } });
            }
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          No credit is given for practice submissions
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${namePrefix}-afterLastDeadlineMode`}
          id={`${namePrefix}-after-deadline-partial-credit`}
          label="Allow submissions for partial credit"
          checked={mode === 'partial_credit'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setField({ isEnabled: true, value: { allowSubmissions: true, credit: 0 } });
            }
          }}
        />
      </div>

      {mode === 'partial_credit' && (
        <div className="ms-4">
          <InputGroup>
            <Form.Control
              type="number"
              min="0"
              max="200"
              placeholder="Credit percentage"
              value={field.value.credit ?? 0}
              onChange={({ currentTarget }) =>
                setField({
                  value: {
                    allowSubmissions: true,
                    credit: Number(currentTarget.value) || 0,
                  },
                })
              }
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          <Form.Text className="text-muted">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );

  // Header content with title and description
  const headerContent = (
    <div>
      <strong>After last deadline</strong>
      <br />
      <small className="text-muted">{getLastDeadlineText()}</small>
    </div>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="After last deadline"
      headerContent={headerContent}
      onOverride={() => enableOverride({ allowSubmissions: false })}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
