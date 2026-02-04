import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useFormState } from 'react-hook-form';

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
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
  /** 'early' for early deadlines (before due date), 'late' for late deadlines (after due date) */
  type: 'early' | 'late';
}

export function DeadlineArrayField({
  control,
  setValue,
  namePrefix,
  type,
}: DeadlineArrayFieldProps) {
  const userTimezone = getUserTimezone();
  const isEarly = type === 'early';

  const fieldPath = isEarly ? 'dateControl.earlyDeadlines' : 'dateControl.lateDeadlines';
  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  const { field, isOverrideRule, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      control,
      setValue,
      namePrefix,
      fieldPath,
      defaultValue: [] as DeadlineEntry[],
    });

  // Watch related fields for validation and display
  const releaseDate = useWatchOverridableField<string>(
    control,
    namePrefix,
    'dateControl.releaseDate',
  );

  const dueDate = useWatchOverridableField<string>(control, namePrefix, 'dateControl.dueDate');

  // Use field array for the deadline entries
  const {
    fields: deadlineFields,
    append: appendDeadline,
    remove: removeDeadline,
  } = useFieldArray({
    control,
    name: getArrayFieldName(namePrefix, `${fieldPath}.value`),
  });

  // Get form errors
  const { errors } = useFormState({ control });

  // Helper to get error message for a deadline
  const getDateError = (index: number) => {
    const err = errors as any;
    const parts = namePrefix.split('.');
    if (parts[0] === 'mainRule') {
      return err?.mainRule?.dateControl?.[isEarly ? 'earlyDeadlines' : 'lateDeadlines']?.value?.[
        index
      ]?.date?.message;
    } else {
      const overrideIndex = Number.parseInt(parts[1]);
      return err?.overrides?.[overrideIndex]?.dateControl?.[
        isEarly ? 'earlyDeadlines' : 'lateDeadlines'
      ]?.value?.[index]?.date?.message;
    }
  };

  const getCreditError = (index: number) => {
    const err = errors as any;
    const parts = namePrefix.split('.');
    if (parts[0] === 'mainRule') {
      return err?.mainRule?.dateControl?.[isEarly ? 'earlyDeadlines' : 'lateDeadlines']?.value?.[
        index
      ]?.credit?.message;
    } else {
      const overrideIndex = Number.parseInt(parts[1]);
      return err?.overrides?.[overrideIndex]?.dateControl?.[
        isEarly ? 'earlyDeadlines' : 'lateDeadlines'
      ]?.value?.[index]?.credit?.message;
    }
  };

  // Get time range text for a deadline
  const getTimeRangeText = (index: number) => {
    if (!releaseDate || !dueDate) return null;

    const range = isEarly
      ? getEarlyDeadlineRange(index, field.value, releaseDate)
      : getLateDeadlineRange(index, field.value, dueDate);

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

  // Validation rules
  // Note: validate functions receive unknown type due to dynamic path, so we cast to expected type
  const validateDate = (value: unknown, index: number) => {
    const stringValue = value as string;
    if (!stringValue) return 'Date is required';
    const deadlineDate = new Date(stringValue);

    if (isEarly) {
      // Early deadline must be before due date
      if (dueDate?.isEnabled && dueDate.value) {
        const currentDueDate = new Date(dueDate.value);
        if (deadlineDate >= currentDueDate) {
          return 'Early deadline must be before due date';
        }
      }
      // Must be after previous early deadline
      if (index > 0 && field.value[index - 1]?.date) {
        if (deadlineDate <= new Date(field.value[index - 1].date)) {
          return 'Must be after previous early deadline';
        }
      }
      // First early deadline must be after release date
      if (index === 0 && releaseDate?.isEnabled && releaseDate.value) {
        if (deadlineDate < new Date(releaseDate.value)) {
          return 'Must be after release date';
        }
      }
    } else {
      // Late deadline must be after due date
      if (dueDate?.isEnabled && dueDate.value) {
        const currentDueDate = new Date(dueDate.value);
        if (deadlineDate <= currentDueDate) {
          return 'Late deadline must be after due date';
        }
      }
      // Must be after previous late deadline
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
      if (numValue < 101 || numValue > 200) return 'Must be 101-200%';
    } else {
      if (numValue < 0 || numValue > 99) return 'Must be 0-99%';
    }
    return true;
  };

  const addDeadline = () => {
    appendDeadline({ date: '', credit: isEarly ? 101 : 99 });
  };

  // Determine if the field should be visible
  // For early deadlines: need release date enabled OR (override rule AND overridden)
  // For late deadlines: need due date enabled OR (override rule AND overridden)
  const shouldShow = () => {
    if (isEarly) {
      return releaseDate?.isEnabled || (isOverrideRule && field.isOverridden);
    } else {
      return (dueDate?.isEnabled && dueDate.value) || (isOverrideRule && field.isOverridden);
    }
  };

  if (!shouldShow()) {
    // For override rules, still show the override button even when hidden
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
      <div className="d-flex align-items-center">
        <Form.Check
          type="checkbox"
          className="me-2"
          checked={field.isEnabled}
          onChange={({ currentTarget }) => toggleEnabled(currentTarget.checked)}
        />
        <strong>{label}</strong>
      </div>
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
                  placeholder="Deadline Date"
                  {...control.register(
                    getFieldName(namePrefix, `${fieldPath}.value.${index}.date`),
                    {
                      validate: (value) => validateDate(value, index),
                    },
                  )}
                />
                {getDateError(index) && (
                  <Form.Text className="text-danger">{getDateError(index)}</Form.Text>
                )}
              </Col>
              <Col md={4}>
                <InputGroup>
                  <Form.Control
                    type="number"
                    placeholder="Credit"
                    min={isEarly ? '101' : '0'}
                    max={isEarly ? '200' : '99'}
                    {...control.register(
                      getFieldName(namePrefix, `${fieldPath}.value.${index}.credit`),
                      { valueAsNumber: true, validate: validateCredit },
                    )}
                  />
                  <InputGroup.Text>%</InputGroup.Text>
                </InputGroup>
                {getCreditError(index) && (
                  <Form.Text className="text-danger">{getCreditError(index)}</Form.Text>
                )}
              </Col>
              <Col md={2} className="d-flex align-items-start">
                <Button size="sm" variant="outline-danger" onClick={() => removeDeadline(index)}>
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
