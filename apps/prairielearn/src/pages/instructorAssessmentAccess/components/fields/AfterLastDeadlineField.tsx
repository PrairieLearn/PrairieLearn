import { Alert, Form, InputGroup } from 'react-bootstrap';
import { get, useFormContext, useFormState } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import {
  type NamePrefix,
  getFieldName,
  useWatchOverridableField,
} from '../hooks/useTypedFormWatch.js';
import type { AccessControlFormData, AfterLastDeadlineValue, DeadlineEntry } from '../types.js';
import { getLastDeadlineDate, getUserTimezone } from '../utils/dateUtils.js';

interface AfterLastDeadlineFieldProps {
  namePrefix: NamePrefix;
}

type AfterLastDeadlineMode = 'no_submissions' | 'practice_submissions' | 'partial_credit';

export function AfterLastDeadlineField({ namePrefix }: AfterLastDeadlineFieldProps) {
  const { register } = useFormContext<AccessControlFormData>();
  const userTimezone = getUserTimezone();

  const { field, isOverrideRule, setField, enableOverride, removeOverride } = useOverridableField({
    namePrefix,
    fieldPath: 'dateControl.afterLastDeadline',
    defaultValue: {} as AfterLastDeadlineValue,
  });

  const dueDate = useWatchOverridableField<string>(namePrefix, 'dateControl.dueDate');

  const lateDeadlines = useWatchOverridableField<DeadlineEntry[]>(
    namePrefix,
    'dateControl.lateDeadlines',
  );

  const getMode = (): AfterLastDeadlineMode => {
    const { allowSubmissions, credit } = field.value;
    if (!allowSubmissions) return 'no_submissions';
    if (credit === undefined) return 'practice_submissions';
    return 'partial_credit';
  };

  const mode = getMode();

  const creditFieldPath = getFieldName(namePrefix, 'dateControl.afterLastDeadline.value.credit');

  const { errors } = useFormState();
  const creditError: string | undefined = get(errors, creditFieldPath)?.message;

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

  const hasLastDeadline =
    (dueDate?.isEnabled && dueDate.value) ||
    (lateDeadlines?.isEnabled && lateDeadlines.value.length > 0);

  const content = (
    <Form.Group>
      {!hasLastDeadline && (
        <Alert variant="warning" className="py-2 mb-2">
          This setting will have no effect because there is no due date set.
        </Alert>
      )}
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
              aria-label="Credit percentage after last deadline"
              aria-invalid={!!creditError}
              aria-errormessage={
                creditError ? `${namePrefix}-after-deadline-credit-error` : undefined
              }
              min="0"
              max="200"
              placeholder="Credit percentage"
              isInvalid={!!creditError}
              {...register(creditFieldPath, {
                shouldUnregister: true,
                valueAsNumber: true,
                validate: (value) => {
                  const num = value as number;
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
              id={`${namePrefix}-after-deadline-credit-error`}
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
