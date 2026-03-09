import { Form } from 'react-bootstrap';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import { type NamePrefix, useWatchOverridableField } from '../hooks/useTypedFormWatch.js';
import type { DeadlineEntry } from '../types.js';
import { getLatestEarlyDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

interface DueDateFieldProps {
  namePrefix: NamePrefix;
}

export function DueDateField({ namePrefix }: DueDateFieldProps) {
  const userTimezone = getUserTimezone();

  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    namePrefix,
    fieldPath: 'dateControl.dueDate',
    defaultValue: '',
    deps: ['dateControl.earlyDeadlines.value', 'dateControl.lateDeadlines.value'],
  });

  const releaseDate = useWatchOverridableField<string>(namePrefix, 'dateControl.releaseDate');

  const earlyDeadlines = useWatchOverridableField<DeadlineEntry[]>(
    namePrefix,
    'dateControl.earlyDeadlines',
  );

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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
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
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              setField({ isEnabled: true });
            }
          }}
        />
      </div>
      {field.isEnabled && (
        <>
          <Form.Control
            type="datetime-local"
            aria-label="Due date"
            value={field.value}
            onChange={({ currentTarget }) => {
              setField({ value: currentTarget.value });
            }}
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
