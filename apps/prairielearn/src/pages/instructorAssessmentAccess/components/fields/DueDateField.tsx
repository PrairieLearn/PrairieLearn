import { Form } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import { getLatestEarlyDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

function DueDateInput({
  value,
  onChange,
  idPrefix,
  releaseDate,
  earlyDeadlines,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
  releaseDate: string | null | undefined;
  earlyDeadlines: DeadlineEntry[] | undefined;
}) {
  const userTimezone = getUserTimezone();

  const getCreditPeriodText = () => {
    if (!value) return null;

    const dueDateObj = new Date(value);
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
    } else if (releaseDate) {
      const releaseDateObj = new Date(releaseDate);
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

  return (
    <Form.Group>
      <div className="mb-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-never`}
          label="No due date"
          checked={value === null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange(null);
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-dueMode`}
          id={`${idPrefix}-due-on-date`}
          label="Due on date"
          checked={value !== null}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange('');
          }}
        />
      </div>
      {value !== null && (
        <>
          <Form.Control
            type="datetime-local"
            aria-label="Due date"
            value={value}
            onChange={({ currentTarget }) => onChange(currentTarget.value)}
          />
          {value && <Form.Text className="text-muted">{getCreditPeriodText()}</Form.Text>}
        </>
      )}
    </Form.Group>
  );
}

export function MainDueDateField() {
  const { field } = useController<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const earlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  return (
    <div>
      <strong>Due date</strong>
      <DueDateInput
        value={field.value}
        idPrefix="mainRule"
        releaseDate={releaseDate}
        earlyDeadlines={earlyDeadlines}
        onChange={field.onChange}
      />
    </div>
  );
}

export function OverrideDueDateField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const { field } = useController({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'dueDate');

  const value = field.value as string | null;

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'releaseDate');
  const releaseDate = useWatch({
    name: `overrides.${index}.releaseDate` as Path<AccessControlFormData>,
  }) as string | null;
  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const { isOverridden: earlyDeadlinesOverridden } = useOverrideField(index, 'earlyDeadlines');
  const earlyDeadlines = useWatch({
    name: `overrides.${index}.earlyDeadlines` as Path<AccessControlFormData>,
  }) as DeadlineEntry[];
  const mainEarlyDeadlines = useWatch<AccessControlFormData, 'mainRule.earlyDeadlines'>({
    name: 'mainRule.earlyDeadlines',
  });

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Due date"
      headerContent={<strong>Due date</strong>}
      onOverride={() => {
        field.onChange(mainValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DueDateInput
        value={value}
        idPrefix={`overrides-${index}`}
        releaseDate={releaseDateOverridden ? releaseDate : mainReleaseDate}
        earlyDeadlines={earlyDeadlinesOverridden ? earlyDeadlines : mainEarlyDeadlines}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
