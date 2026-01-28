import { Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import { type NamePrefix, useWatchOverridableField } from '../hooks/useTypedFormWatch.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import { getLatestEarlyDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

interface DueDateFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

export function DueDateField({ control, setValue, namePrefix }: DueDateFieldProps) {
  const userTimezone = getUserTimezone();

  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    control,
    setValue,
    namePrefix,
    fieldPath: 'dateControl.dueDate',
    defaultValue: '',
  });

  // Watch release date and early deadlines for credit period display
  const releaseDate = useWatchOverridableField<string>(
    control,
    namePrefix,
    'dateControl.releaseDate',
  );

  const earlyDeadlines = useWatchOverridableField<DeadlineEntry[]>(
    control,
    namePrefix,
    'dateControl.earlyDeadlines',
  );

  // Calculate the credit period text
  const getCreditPeriodText = () => {
    if (!field.value) return null;

    const dueDateObj = new Date(field.value);
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
    } else if (releaseDate?.isEnabled && releaseDate.value) {
      const releaseDateObj = new Date(releaseDate.value);
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

  const content = (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${namePrefix}-dueMode`}
          id={`${namePrefix}-due-never`}
          label="No due date"
          checked={!field.isEnabled}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: false });
            }
          }}
        />
        <Form.Check
          type="radio"
          name={`${namePrefix}-dueMode`}
          id={`${namePrefix}-due-on-date`}
          label="Due on date"
          checked={field.isEnabled}
          onChange={(e) => {
            if ((e.target as HTMLInputElement).checked) {
              setField({ isEnabled: true });
            }
          }}
        />
      </div>
      {field.isEnabled && (
        <>
          <Form.Control
            type="datetime-local"
            value={field.value}
            onChange={(e) => setField({ value: (e.target as HTMLInputElement).value })}
          />
          {field.value && <Form.Text className="text-muted">{getCreditPeriodText()}</Form.Text>}
        </>
      )}
    </Form.Group>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="Due date"
      headerContent={<strong>Due date</strong>}
      onOverride={() => enableOverride('')}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
