import { Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import {
  AfterLastDeadlineField,
  DeadlineArrayField,
  DueDateField,
  DurationField,
  PasswordField,
  ReleaseDateField,
} from './fields/index.js';
import type { AccessControlFormData, OverridableField } from './types.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface DateControlFormProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix?: NamePrefix;
  title?: string;
  description?: string;
}

export function DateControlForm({
  control,
  setValue,
  namePrefix = 'mainRule',
  title = 'Date control',
  description = 'Control access and credit to your exam based on a schedule',
}: DateControlFormProps) {
  const isOverrideRule = namePrefix.startsWith('overrides.');

  // Watch the dateControl.enabled state (only used for main rule)
  const dateControlEnabledField = useWatch({
    control,
    name: `${namePrefix}.dateControl.enabled` as any,
  });

  // Watch fields to determine if any override is active (for override rules)
  const releaseDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.releaseDate` as any,
  }) as OverridableField<string> | undefined;

  const dueDate = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDate` as any,
  }) as OverridableField<string> | undefined;

  const earlyDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.earlyDeadlines` as any,
  }) as OverridableField<unknown> | undefined;

  const lateDeadlines = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlines` as any,
  }) as OverridableField<unknown> | undefined;

  const afterLastDeadline = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline` as any,
  }) as OverridableField<unknown> | undefined;

  const durationMinutes = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutes` as any,
  }) as OverridableField<unknown> | undefined;

  const password = useWatch({
    control,
    name: `${namePrefix}.dateControl.password` as any,
  }) as OverridableField<unknown> | undefined;

  // For override rules, date control is implicitly enabled if any field is overridden
  // For main rules, use the explicit enabled checkbox
  const dateControlEnabled = isOverrideRule
    ? releaseDate?.isOverridden ||
      dueDate?.isOverridden ||
      earlyDeadlines?.isOverridden ||
      lateDeadlines?.isOverridden ||
      afterLastDeadline?.isOverridden ||
      durationMinutes?.isOverridden ||
      password?.isOverridden
    : dateControlEnabledField;

  // Check if any date-based fields are enabled (for showing After Last Deadline)
  const hasAnyDateControl =
    dueDate?.isEnabled || earlyDeadlines?.isOverridden || lateDeadlines?.isOverridden;

  // Early return if form values haven't loaded yet
  if (!releaseDate || !dueDate || !durationMinutes || !password) {
    return null;
  }

  return (
    <Card class="mb-4">
      <Card.Header>
        <div>
          <div class="d-flex align-items-center">
            {!isOverrideRule && (
              <Form.Check
                type="checkbox"
                class="me-2"
                {...control.register(`${namePrefix}.dateControl.enabled` as any)}
              />
            )}
            <span>{title}</span>
          </div>
          <Form.Text class="text-muted">
            {isOverrideRule
              ? 'Override date settings from the main rule by clicking "Override" on individual fields'
              : description}
          </Form.Text>
        </div>
      </Card.Header>
      <Card.Body
        style={{
          // For override rules, always show at full opacity since individual fields control overrides
          opacity: isOverrideRule || dateControlEnabled ? 1 : 0.5,
          pointerEvents: isOverrideRule || dateControlEnabled ? 'auto' : 'none',
        }}
      >
        <div>
          {/* Release Date and Due Date */}
          <Row class="mb-3">
            <Col md={6}>
              <ReleaseDateField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
            <Col md={6}>
              <DueDateField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
          </Row>

          {/* Early and Late Deadlines */}
          <Row class="mb-4">
            <Col md={6}>
              <DeadlineArrayField
                control={control}
                setValue={setValue}
                namePrefix={namePrefix}
                type="early"
              />
            </Col>
            <Col md={6}>
              <DeadlineArrayField
                control={control}
                setValue={setValue}
                namePrefix={namePrefix}
                type="late"
              />
            </Col>
          </Row>

          <hr class="my-4" />

          {/* After Last Deadline - show when dates are configured or it's an override rule */}
          {(isOverrideRule || hasAnyDateControl) && (
            <div class="mb-3">
              <AfterLastDeadlineField
                control={control}
                setValue={setValue}
                namePrefix={namePrefix}
              />
            </div>
          )}

          <hr class="my-4" />

          {/* Duration and Password */}
          <Row class="mb-3">
            <Col md={6}>
              <DurationField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
            <Col md={6}>
              <PasswordField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
          </Row>
        </div>
      </Card.Body>
    </Card>
  );
}
