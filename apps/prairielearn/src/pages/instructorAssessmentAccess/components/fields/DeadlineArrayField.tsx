import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import {
  type Path,
  get,
  useController,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { FriendlyDate } from '../../../../components/FriendlyDate.js';
import { FieldWrapper } from '../FieldWrapper.js';
import type { AccessControlFormData, DeadlineEntry } from '../types.js';
import {
  getEarlyDeadlineRange,
  getLateDeadlineRange,
  getUserTimezone,
} from '../utils/dateUtils.js';

interface DeadlineArrayInputProps {
  type: 'early' | 'late';
  fieldArrayName: string;
  idPrefix: string;
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  deadlines: DeadlineEntry[];
}

function DeadlineArrayInput({
  type,
  fieldArrayName,
  idPrefix,
  releaseDate,
  dueDate,
  deadlines,
}: DeadlineArrayInputProps) {
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

    const range = isEarly
      ? getEarlyDeadlineRange(index, currentDeadlines, releaseDate)
      : getLateDeadlineRange(index, currentDeadlines, dueDate);

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
              for (let i = deadlineFields.length - 1; i >= 0; i--) {
                removeDeadline(i);
              }
            }
          }}
        />
        <Button size="sm" variant="outline-primary" onClick={addDeadline}>
          Add {isEarly ? 'early' : 'late'}
        </Button>
      </div>

      {deadlineFields.map((deadlineField, index) => (
        <div key={deadlineField.id} className="mb-3">
          <Row className="mb-1">
            <Col md={6}>
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
            </Col>
            <Col md={4}>
              <InputGroup>
                <Form.Control
                  type="number"
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
              {getCreditError(index) && (
                <Form.Text
                  id={`${idPrefix}-${type}-deadline-${index}-credit-error`}
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
}

interface MainDeadlineArrayFieldProps {
  type: 'early' | 'late';
}

export function MainDeadlineArrayField({ type }: MainDeadlineArrayFieldProps) {
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

interface OverrideDeadlineArrayFieldProps {
  index: number;
  type: 'early' | 'late';
}

export function OverrideDeadlineArrayField({ index, type }: OverrideDeadlineArrayFieldProps) {
  const isEarly = type === 'early';
  const fieldPath = isEarly ? 'earlyDeadlines' : 'lateDeadlines';
  const label = isEarly ? 'Early deadlines' : 'Late deadlines';

  const { field } = useController({
    name: `overrides.${index}.${fieldPath}` as Path<AccessControlFormData>,
  });

  const value = field.value as DeadlineEntry[] | undefined;
  const isOverridden = value !== undefined;

  const mainReleaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const overrideReleaseDate = useWatch({
    name: `overrides.${index}.releaseDate` as Path<AccessControlFormData>,
  }) as string | null | undefined;
  const overrideDueDate = useWatch({
    name: `overrides.${index}.dueDate` as Path<AccessControlFormData>,
  }) as string | null | undefined;

  const effectiveReleaseDate =
    overrideReleaseDate !== undefined ? overrideReleaseDate : mainReleaseDate;
  const effectiveDueDate = overrideDueDate !== undefined ? overrideDueDate : mainDueDate;

  const mainDeadlines = useWatch({
    name: `mainRule.${fieldPath}` as Path<AccessControlFormData>,
  }) as DeadlineEntry[];
  const inheritedText =
    mainDeadlines.length > 0
      ? `${mainDeadlines.length} ${isEarly ? 'early' : 'late'} deadline(s)`
      : `No ${isEarly ? 'early' : 'late'} deadlines`;

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label={label}
      inheritedValue={inheritedText}
      onOverride={() => field.onChange([])}
      onRemoveOverride={() => field.onChange(undefined)}
    >
      <DeadlineArrayInput
        type={type}
        fieldArrayName={`overrides.${index}.${fieldPath}`}
        idPrefix={`overrides-${index}`}
        releaseDate={effectiveReleaseDate}
        dueDate={effectiveDueDate}
        deadlines={value ?? []}
      />
    </FieldWrapper>
  );
}
