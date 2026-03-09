import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { get, useFieldArray, useFormContext, useFormState } from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import {
  type NamePrefix,
  getArrayFieldName,
  getFieldName,
  useWatchOverridableField,
} from '../hooks/useTypedFormWatch.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import {
  getEarlyDeadlineRange,
  getLateDeadlineRange,
  getUserTimezone,
} from '../utils/dateUtils.js';

interface DeadlineArrayFieldProps {
  namePrefix: NamePrefix;
  /** 'early' for early deadlines (before due date), 'late' for late deadlines (after due date) */
  type: 'early' | 'late';
}

export function DeadlineArrayField({ namePrefix, type }: DeadlineArrayFieldProps) {
  const { register } = useFormContext<AccessControlFormData>();
  const userTimezone = getUserTimezone();
  const isEarly = type === 'early';

  const fieldPath = isEarly ? 'dateControl.earlyDeadlines' : 'dateControl.lateDeadlines';
  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  const { field, isOverrideRule, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      namePrefix,
      fieldPath,
      defaultValue: [] as DeadlineEntry[],
    });

  const releaseDate = useWatchOverridableField<string>(namePrefix, 'dateControl.releaseDate');

  const dueDate = useWatchOverridableField<string>(namePrefix, 'dateControl.dueDate');

  // `getArrayFieldName` returns a union of all valid field array paths in
  // AccessControlFormData, so `fields` is typed as a union of all possible
  // element types (deadlines, individuals, labels, etc.). We narrow it here
  // since we know this component only operates on deadline arrays.
  const {
    fields: rawDeadlineFields,
    append: appendDeadline,
    remove: removeDeadline,
  } = useFieldArray({
    name: getArrayFieldName(namePrefix, `${fieldPath}.value`),
  });
  const deadlineFields = rawDeadlineFields as (DeadlineEntry & { id: string })[];

  const { errors } = useFormState();

  const getDateError = (index: number): string | undefined => {
    return get(errors, `${namePrefix}.${fieldPath}.value.${index}.date`)?.message;
  };

  const getCreditError = (index: number): string | undefined => {
    return get(errors, `${namePrefix}.${fieldPath}.value.${index}.credit`)?.message;
  };

  const getTimeRangeText = (index: number) => {
    if (!releaseDate || !dueDate) return null;

    // Use deadlineFields (from useFieldArray) as the source of truth rather than
    // field.value (from useWatch), since useFieldArray updates synchronously on
    // append/remove while useWatch lags by one render.
    const deadlines: DeadlineEntry[] = deadlineFields.map((f) => ({
      date: f.date,
      credit: f.credit,
    }));

    const range = isEarly
      ? getEarlyDeadlineRange(index, deadlines, releaseDate)
      : getLateDeadlineRange(index, deadlines, dueDate);

    if (!range) return null;

    if (!range.start) {
      const prefix = isEarly ? 'While accessible' : 'After due date';
      return (
        <>
          {prefix} –{' '}
          <FriendlyDate date={range.end} timezone={userTimezone} options={{ includeTz: false }} />
        </>
      );
    }

    return (
      <>
        <FriendlyDate date={range.start} timezone={userTimezone} options={{ includeTz: false }} /> –{' '}
        <FriendlyDate date={range.end} timezone={userTimezone} options={{ includeTz: false }} />
      </>
    );
  };

  // validate functions receive unknown type due to dynamic path, so we cast to expected type
  const validateDate = (value: unknown, index: number) => {
    const stringValue = value as string;
    if (!stringValue) return 'Date is required';
    const deadlineDate = new Date(stringValue);

    if (isEarly) {
      if (dueDate?.isEnabled && dueDate.value) {
        const currentDueDate = new Date(dueDate.value);
        if (deadlineDate >= currentDueDate) {
          return 'Early deadline must be before due date';
        }
      }
      if (index > 0 && field.value[index - 1]?.date) {
        if (deadlineDate <= new Date(field.value[index - 1].date)) {
          return 'Must be after previous early deadline';
        }
      }
      if (releaseDate?.isEnabled && releaseDate.value) {
        if (deadlineDate < new Date(releaseDate.value)) {
          return 'Must be after release date';
        }
      }
    } else {
      if (dueDate?.isEnabled && dueDate.value) {
        const currentDueDate = new Date(dueDate.value);
        if (deadlineDate <= currentDueDate) {
          return 'Late deadline must be after due date';
        }
      }
      if (index > 0 && field.value[index - 1]?.date) {
        if (deadlineDate <= new Date(field.value[index - 1].date)) {
          return 'Must be after previous late deadline';
        }
      }
    }

    return true;
  };

  const validateCredit = (value: unknown) => {
    const numValue = value as number;
    if (isEarly) {
      if (numValue < 101 || numValue > 200) return 'Credit must be 101-200%';
    } else {
      if (numValue < 0 || numValue > 99) return 'Credit must be 0-99%';
    }
    return true;
  };

  const addDeadline = () => {
    appendDeadline({ date: '', credit: isEarly ? 101 : 99 });
  };

  const shouldShow = () => {
    if (isEarly) {
      return releaseDate?.isEnabled || (isOverrideRule && field.isOverridden);
    } else {
      return (dueDate?.isEnabled && dueDate.value) || (isOverrideRule && field.isOverridden);
    }
  };

  if (!shouldShow()) {
    if (isOverrideRule) {
      return (
        <FieldWrapper
          isOverrideRule={isOverrideRule}
          isOverridden={field.isOverridden}
          label={label}
          onOverride={() => enableOverride([])}
          onRemoveOverride={removeOverride}
        >
          <div className="text-muted">
            {isEarly
              ? 'Enable release date to configure early deadlines'
              : 'Enable due date to configure late deadlines'}
          </div>
        </FieldWrapper>
      );
    }
    return null;
  }

  const headerContent = (
    <div className="d-flex justify-content-between align-items-center" style={{ flex: 1 }}>
      <Form.Check
        type="checkbox"
        id={`${namePrefix}-${type}-deadlines-enabled`}
        label={<strong>{label}</strong>}
        checked={field.isEnabled}
        onChange={({ currentTarget }) => toggleEnabled(currentTarget.checked)}
      />
      <Button size="sm" variant="outline-primary" disabled={!field.isEnabled} onClick={addDeadline}>
        Add {isEarly ? 'early' : 'late'}
      </Button>
    </div>
  );

  const content = (
    <div>
      {field.isEnabled &&
        deadlineFields.map((deadlineField, index) => (
          <div key={deadlineField.id} className="mb-3">
            <Row className="mb-1">
              <Col md={6}>
                <Form.Control
                  type="datetime-local"
                  aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} date`}
                  aria-invalid={!!getDateError(index)}
                  aria-errormessage={
                    getDateError(index)
                      ? `${namePrefix}-${type}-deadline-${index}-date-error`
                      : undefined
                  }
                  placeholder="Deadline Date"
                  {...register(getFieldName(namePrefix, `${fieldPath}.value.${index}.date`), {
                    validate: (value) => validateDate(value, index),
                  })}
                />
                {getDateError(index) && (
                  <Form.Text
                    id={`${namePrefix}-${type}-deadline-${index}-date-error`}
                    className="text-danger"
                    role="alert"
                  >
                    {getDateError(index)}
                  </Form.Text>
                )}
              </Col>
              <Col md={4}>
                <InputGroup>
                  <Form.Control
                    type="number"
                    aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} credit percentage`}
                    aria-invalid={!!getCreditError(index)}
                    aria-errormessage={
                      getCreditError(index)
                        ? `${namePrefix}-${type}-deadline-${index}-credit-error`
                        : undefined
                    }
                    placeholder="Credit"
                    min={isEarly ? '101' : '0'}
                    max={isEarly ? '200' : '99'}
                    {...register(getFieldName(namePrefix, `${fieldPath}.value.${index}.credit`), {
                      valueAsNumber: true,
                      validate: validateCredit,
                    })}
                  />
                  <InputGroup.Text>%</InputGroup.Text>
                </InputGroup>
                {getCreditError(index) && (
                  <Form.Text
                    id={`${namePrefix}-${type}-deadline-${index}-credit-error`}
                    className="text-danger"
                    role="alert"
                  >
                    {getCreditError(index)}
                  </Form.Text>
                )}
              </Col>
              <Col md={2} className="d-flex align-items-start">
                <Button
                  size="sm"
                  variant="outline-danger"
                  aria-label={`Remove ${isEarly ? 'early' : 'late'} deadline ${index + 1}`}
                  onClick={() => removeDeadline(index)}
                >
                  <i className="bi bi-trash" aria-hidden="true" />
                </Button>
              </Col>
            </Row>
            <Form.Text className="text-muted">{getTimeRangeText(index)}</Form.Text>
          </div>
        ))}
    </div>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label={label}
      headerContent={headerContent}
      onOverride={() => enableOverride([])}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
