import { Alert, Form, InputGroup } from 'react-bootstrap';
import {
  type Path,
  get,
  useController,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { getFieldName } from '../hooks/useTypedFormWatch.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

function getMode(value: AfterLastDeadlineValue | null): AfterLastDeadlineMode {
  if (!value) return 'no_submissions';
  const { allowSubmissions, credit } = value;
  if (!allowSubmissions) return 'no_submissions';
  if (credit === undefined) return 'practice_submissions';
  return 'partial_credit';
}

function formatInheritedValue(value: AfterLastDeadlineValue | null): string {
  if (!value) return 'No submissions';
  if (!value.allowSubmissions) return 'No submissions';
  if (value.credit === undefined) return 'Practice submissions';
  return `${value.credit}% credit`;
}

interface AfterLastDeadlineInputProps {
  value: AfterLastDeadlineValue | null;
  onChange: (value: AfterLastDeadlineValue | null) => void;
  idPrefix: string;
  dueDate: string | null | undefined;
  lateDeadlines: DeadlineEntry[] | undefined;
  creditFieldPath: string;
}

function AfterLastDeadlineInput({
  value,
  onChange,
  idPrefix,
  dueDate,
  lateDeadlines,
  creditFieldPath,
}: AfterLastDeadlineInputProps) {
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

  return (
    <Form.Group>
      {!hasLastDeadline && (
        <Alert variant="warning" className="py-2 mb-2">
          This setting will have no effect because there is no due date set.
        </Alert>
      )}
      <div>
        <strong>After last deadline</strong>
        <br />
        <small className="text-muted">{getLastDeadlineText()}</small>
      </div>
      <div className="mb-2 mt-2">
        <Form.Check
          type="radio"
          name={`${idPrefix}-afterLastDeadlineMode`}
          id={`${idPrefix}-after-deadline-no-submissions`}
          label="No submissions allowed"
          checked={mode === 'no_submissions'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ allowSubmissions: false });
          }}
        />
        <Form.Check
          type="radio"
          name={`${idPrefix}-afterLastDeadlineMode`}
          id={`${idPrefix}-after-deadline-practice-submissions`}
          label="Allow practice submissions"
          checked={mode === 'practice_submissions'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ allowSubmissions: true });
          }}
        />
        <Form.Text className="text-muted ms-4 mb-3 d-block">
          No credit is given for practice submissions
        </Form.Text>

        <Form.Check
          type="radio"
          name={`${idPrefix}-afterLastDeadlineMode`}
          id={`${idPrefix}-after-deadline-partial-credit`}
          label="Allow submissions for partial credit"
          checked={mode === 'partial_credit'}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) onChange({ allowSubmissions: true, credit: 0 });
          }}
        />
      </div>

      {mode === 'partial_credit' && (
        <div className="ms-4">
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

  const value = field.value as AfterLastDeadlineValue | null | undefined;
  const isOverridden = value !== undefined;

  const dueDate = useWatch({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
  }) as string | null | undefined;
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const lateDeadlines = useWatch({
    name: `overrides.${index}.lateDeadlines` as Path<AccessControlFormData>,
  }) as DeadlineEntry[] | undefined;
  const mainLateDeadlines = useWatch<AccessControlFormData, 'mainRule.lateDeadlines'>({
    name: 'mainRule.lateDeadlines',
  });

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="After last deadline"
      inheritedValue={formatInheritedValue(mainValue)}
      onOverride={() => field.onChange(mainValue ?? { allowSubmissions: false })}
      onRemoveOverride={() => field.onChange(undefined)}
    >
      <AfterLastDeadlineInput
        value={value as AfterLastDeadlineValue | null}
        idPrefix={`overrides-${index}`}
        dueDate={dueDate !== undefined ? dueDate : mainDueDate}
        lateDeadlines={lateDeadlines !== undefined ? lateDeadlines : mainLateDeadlines}
        creditFieldPath={getFieldName(`overrides.${index}`, 'afterLastDeadline.credit')}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
