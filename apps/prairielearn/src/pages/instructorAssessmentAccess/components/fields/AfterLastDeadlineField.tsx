import { Alert, Form, InputGroup } from 'react-bootstrap';
import {
  type Path,
  get,
  useController,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { getFieldName } from '../hooks/fieldNames.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

const AFTER_LAST_DEADLINE_ITEMS: RichSelectItem<AfterLastDeadlineMode>[] = [
  {
    value: 'no_submissions',
    label: 'No submissions allowed',
    description: 'Students can still view but not submit',
  },
  {
    value: 'practice_submissions',
    label: 'Allow practice submissions',
    description: 'No credit is given for practice submissions',
  },
  {
    value: 'partial_credit',
    label: 'Allow submissions for partial credit',
    description: 'Students will receive partial credit for submissions after the deadline',
  },
];

function getMode(value: AfterLastDeadlineValue | null): AfterLastDeadlineMode {
  if (!value) return 'no_submissions';
  const { allowSubmissions, credit } = value;
  if (!allowSubmissions) return 'no_submissions';
  if (credit === undefined) return 'practice_submissions';
  return 'partial_credit';
}

function AfterLastDeadlineInput({
  value,
  onChange,
  idPrefix,
  dueDate,
  lateDeadlines,
  creditFieldPath,
}: {
  value: AfterLastDeadlineValue | null;
  onChange: (value: AfterLastDeadlineValue | null) => void;
  idPrefix: string;
  dueDate: string | null | undefined;
  lateDeadlines: DeadlineEntry[] | undefined;
  creditFieldPath: string;
}) {
  const { register } = useFormContext<AccessControlFormData>();
  const userTimezone = getUserTimezone();
  const { errors } = useFormState();
  const creditError: string | undefined = get(errors, creditFieldPath)?.message;

  const mode = getMode(value);

  const getLastDeadlineText = () => {
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

  const hasLastDeadline = !!dueDate || (lateDeadlines && lateDeadlines.length > 0);

  const handleModeChange = (newMode: AfterLastDeadlineMode) => {
    switch (newMode) {
      case 'no_submissions':
        onChange({ allowSubmissions: false });
        break;
      case 'practice_submissions':
        onChange({ allowSubmissions: true });
        break;
      case 'partial_credit':
        onChange({ allowSubmissions: true, credit: 0 });
        break;
    }
  };

  return (
    <Form.Group>
      <div>
        <strong>After last deadline</strong>
        <br />
        <small className="text-muted">{getLastDeadlineText()}</small>
      </div>
      <div className="mb-2 mt-2">
        <RichSelect
          items={AFTER_LAST_DEADLINE_ITEMS}
          value={mode}
          aria-label="After last deadline"
          id={`${idPrefix}-after-deadline-mode`}
          minWidth={300}
          onChange={handleModeChange}
        />
      </div>
      {!hasLastDeadline && (
        <Alert variant="warning" className="py-2 mb-2">
          This setting will have no effect because there is no due date set.
        </Alert>
      )}

      {mode === 'partial_credit' && (
        <div className="mt-2">
          <InputGroup>
            <Form.Control
              type="number"
              aria-label="Credit percentage after last deadline"
              aria-invalid={!!creditError}
              aria-errormessage={
                creditError ? `${idPrefix}-after-deadline-credit-error` : undefined
              }
              min="0"
              max="200"
              placeholder="Credit percentage"
              isInvalid={!!creditError}
              {...register(creditFieldPath as Parameters<typeof register>[0], {
                shouldUnregister: true,
                valueAsNumber: true,
                validate: (v) => {
                  const num = v as number;
                  if (Number.isNaN(num)) return 'Credit is required';
                  if (num < 0 || num > 200) return 'Must be 0–200%';
                  return true;
                },
              })}
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          {creditError && (
            <Form.Text
              id={`${idPrefix}-after-deadline-credit-error`}
              className="text-danger d-block"
              role="alert"
            >
              {creditError}
            </Form.Text>
          )}
          <Form.Text className="text-muted d-block">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );
}

export function MainAfterLastDeadlineField() {
  const { field } = useController<AccessControlFormData, 'mainRule.afterLastDeadline'>({
    name: 'mainRule.afterLastDeadline',
  });

  const dueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const lateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });

  return (
    <AfterLastDeadlineInput
      value={field.value}
      idPrefix="mainRule"
      dueDate={dueDate}
      lateDeadlines={lateDeadlines}
      creditFieldPath="mainRule.afterLastDeadline.credit"
      onChange={field.onChange}
    />
  );
}

export function OverrideAfterLastDeadlineField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.afterLastDeadline'>({
    name: 'mainRule.afterLastDeadline',
  });

  const { field } = useController({
    name: `overrides.${index}.afterLastDeadline` as Path<AccessControlFormData>,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(
    index,
    'afterLastDeadline',
  );

  const { isOverridden: dueDateOverridden } = useOverrideField(index, 'dueDate');
  const dueDate = useWatch({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
  }) as string | null;
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const { isOverridden: lateDeadlinesOverridden } = useOverrideField(index, 'lateDeadlines');
  const lateDeadlines = useWatch({
    name: `overrides.${index}.lateDeadlines` as Path<AccessControlFormData>,
  }) as DeadlineEntry[];
  const mainLateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="After last deadline"
      onOverride={() => {
        field.onChange(mainValue ?? { allowSubmissions: false });
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <AfterLastDeadlineInput
        value={field.value as AfterLastDeadlineValue | null}
        idPrefix={`overrides-${index}`}
        dueDate={dueDateOverridden ? dueDate : mainDueDate}
        lateDeadlines={lateDeadlinesOverridden ? lateDeadlines : mainLateDeadlines}
        creditFieldPath={getFieldName(`overrides.${index}`, 'afterLastDeadline.credit')}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
