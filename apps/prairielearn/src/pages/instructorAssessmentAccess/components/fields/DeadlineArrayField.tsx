import { Button, Form, InputGroup } from 'react-bootstrap';
import {
  type Path,
  get,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import { getDeadlineRange, getUserTimezone } from '../utils/dateUtils.js';

function DeadlineArrayInput({
  type,
  fieldArrayName,
  idPrefix,
  releaseDate,
  dueDate,
  deadlines,
}: {
  type: 'early' | 'late';
  fieldArrayName: string;
  idPrefix: string;
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  deadlines: DeadlineEntry[];
}) {
  const { register } = useFormContext<AccessControlFormData>();
  const userTimezone = getUserTimezone();
  const isEarly = type === 'early';

  const {
    fields: rawDeadlineFields,
    append: appendDeadline,
    remove: removeDeadline,
  } = useFieldArray({
    name: fieldArrayName,
  });
  const deadlineFields = rawDeadlineFields as (DeadlineEntry & { id: string })[];

  const { errors } = useFormState();

  const getDateError = (index: number): string | undefined => {
    return get(errors, `${fieldArrayName}.${index}.date`)?.message;
  };

  const getCreditError = (index: number): string | undefined => {
    return get(errors, `${fieldArrayName}.${index}.credit`)?.message;
  };

  const getTimeRangeText = (index: number) => {
    const currentDeadlines: DeadlineEntry[] = deadlineFields.map((f) => ({
      date: f.date,
      credit: f.credit,
    }));

    const anchorDate = isEarly ? releaseDate : dueDate;
    const range = getDeadlineRange(index, currentDeadlines, anchorDate);

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

  const validateDate = (value: unknown, index: number) => {
    const stringValue = value as string;
    if (!stringValue) return 'Date is required';
    const deadlineDate = new Date(stringValue);

    if (isEarly) {
      if (dueDate) {
        const currentDueDate = new Date(dueDate);
        if (deadlineDate >= currentDueDate) {
          return 'Early deadline must be before due date';
        }
      }
      if (index > 0 && deadlines[index - 1]?.date) {
        if (deadlineDate <= new Date(deadlines[index - 1].date)) {
          return 'Must be after previous early deadline';
        }
      }
      if (releaseDate) {
        if (deadlineDate < new Date(releaseDate)) {
          return 'Must be after release date';
        }
      }
    } else {
      if (dueDate) {
        const currentDueDate = new Date(dueDate);
        if (deadlineDate <= currentDueDate) {
          return 'Late deadline must be after due date';
        }
      }
      if (index > 0 && deadlines[index - 1]?.date) {
        if (deadlineDate <= new Date(deadlines[index - 1].date)) {
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

  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Form.Check
          type="checkbox"
          id={`${idPrefix}-${type}-deadlines-enabled`}
          label={<strong>{label}</strong>}
          checked={deadlineFields.length > 0}
          onChange={({ currentTarget }) => {
            if (currentTarget.checked) {
              addDeadline();
            } else {
              // Remove all deadlines
              removeDeadline();
            }
          }}
        />
        <Button size="sm" variant="outline-primary" onClick={addDeadline}>
          Add {isEarly ? 'early' : 'late'}
        </Button>
      </div>

      {deadlineFields.map((deadlineField, index) => (
        <div key={deadlineField.id} className="mb-3">
          <div className="d-flex gap-2 mb-1">
            <div className="flex-grow-1">
              <Form.Control
                type="datetime-local"
                aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} date`}
                aria-invalid={!!getDateError(index)}
                aria-errormessage={
                  getDateError(index)
                    ? `${idPrefix}-${type}-deadline-${index}-date-error`
                    : undefined
                }
                placeholder="Deadline Date"
                {...register(`${fieldArrayName}.${index}.date` as Parameters<typeof register>[0], {
                  validate: (value) => validateDate(value, index),
                })}
              />
              {getDateError(index) && (
                <Form.Text
                  id={`${idPrefix}-${type}-deadline-${index}-date-error`}
                  className="text-danger"
                  role="alert"
                >
                  {getDateError(index)}
                </Form.Text>
              )}
            </div>
            <InputGroup style={{ width: 'auto', flex: '0 0 auto' }}>
              <Form.Control
                type="number"
                style={{ width: '5rem' }}
                aria-label={`${isEarly ? 'Early' : 'Late'} deadline ${index + 1} credit percentage`}
                aria-invalid={!!getCreditError(index)}
                aria-errormessage={
                  getCreditError(index)
                    ? `${idPrefix}-${type}-deadline-${index}-credit-error`
                    : undefined
                }
                placeholder="Credit"
                min={isEarly ? '101' : '0'}
                max={isEarly ? '200' : '99'}
                {...register(
                  `${fieldArrayName}.${index}.credit` as Parameters<typeof register>[0],
                  {
                    valueAsNumber: true,
                    validate: validateCredit,
                  },
                )}
              />
              <InputGroup.Text>%</InputGroup.Text>
            </InputGroup>
            <Button
              size="sm"
              variant="outline-danger"
              aria-label={`Remove ${isEarly ? 'early' : 'late'} deadline ${index + 1}`}
              onClick={() => removeDeadline(index)}
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          </div>
          {getCreditError(index) && (
            <Form.Text
              id={`${idPrefix}-${type}-deadline-${index}-credit-error`}
              className="text-danger"
              role="alert"
            >
              {getCreditError(index)}
            </Form.Text>
          )}
          <Form.Text className="text-muted">{getTimeRangeText(index)}</Form.Text>
        </div>
      ))}
    </div>
  );
}

export function MainDeadlineArrayField({ type }: { type: 'early' | 'late' }) {
  const isEarly = type === 'early';
  const fieldName = isEarly ? 'mainRule.earlyDeadlines' : 'mainRule.lateDeadlines';

  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const dueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const deadlines = useWatch({
    name: fieldName as Path<AccessControlFormData>,
  }) as DeadlineEntry[] | undefined;

  const shouldShow = isEarly ? releaseDate !== null : dueDate !== null && !!dueDate;

  if (!shouldShow) return null;

  return (
    <DeadlineArrayInput
      type={type}
      fieldArrayName={fieldName}
      idPrefix="mainRule"
      releaseDate={releaseDate}
      dueDate={dueDate}
      deadlines={deadlines ?? []}
    />
  );
}

export function OverrideDeadlineArrayField({
  index,
  type,
}: {
  index: number;
  type: 'early' | 'late';
}) {
  const isEarly = type === 'early';
  const fieldPath = isEarly ? 'earlyDeadlines' : 'lateDeadlines';
  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, fieldPath);

  const deadlines = useWatch({
    name: `overrides.${index}.${fieldPath}` as Path<AccessControlFormData>,
  }) as DeadlineEntry[];

  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const { isOverridden: releaseDateOverridden } = useOverrideField(index, 'releaseDate');
  const overrideReleaseDate = useWatch({
    name: `overrides.${index}.releaseDate` as Path<AccessControlFormData>,
  }) as string | null;
  const { isOverridden: dueDateOverridden } = useOverrideField(index, 'dueDate');
  const overrideDueDate = useWatch({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
  }) as string | null;

  const effectiveReleaseDate = releaseDateOverridden ? overrideReleaseDate : mainReleaseDate;
  const effectiveDueDate = dueDateOverridden ? overrideDueDate : mainDueDate;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label={label}
      onOverride={addOverride}
      onRemoveOverride={removeOverride}
    >
      <DeadlineArrayInput
        type={type}
        fieldArrayName={`overrides.${index}.${fieldPath}`}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        dueDate={effectiveDueDate}
        deadlines={deadlines}
      />
    </FieldWrapper>
  );
}
