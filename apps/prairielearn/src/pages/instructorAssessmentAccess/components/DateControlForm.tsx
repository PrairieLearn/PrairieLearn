import { Card, Col, Form, Row } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import { AfterLastDeadlineField } from './fields/AfterLastDeadlineField.js';
import { DeadlineArrayField } from './fields/DeadlineArrayField.js';
import { DueDateField } from './fields/DueDateField.js';
import { DurationField } from './fields/DurationField.js';
import { PasswordField } from './fields/PasswordField.js';
import { ReleaseDateField } from './fields/ReleaseDateField.js';
import { type NamePrefix, getFieldName, useWatchField } from './hooks/useTypedFormWatch.js';
import type { AccessControlFormData, DateControlFormData } from './types.js';

interface DateControlFormProps {
  namePrefix?: NamePrefix;
  title?: string;
  description?: string;
}

export function DateControlForm({
  namePrefix = 'mainRule',
  title = 'Date control',
  description = 'Control access and credit to your exam based on a schedule',
}: DateControlFormProps) {
  const { register } = useFormContext<AccessControlFormData>();
  const isOverrideRule = namePrefix.startsWith('overrides.');

  const dateControl = useWatchField<DateControlFormData>(namePrefix, 'dateControl');

  if (!dateControl) {
    return null;
  }

  // For override rules, date control is implicitly enabled if any field is overridden
  // For main rules, use the explicit enabled checkbox
  const dateControlEnabled = isOverrideRule
    ? dateControl.releaseDate.isOverridden ||
      dateControl.dueDate.isOverridden ||
      dateControl.earlyDeadlines.isOverridden ||
      dateControl.lateDeadlines.isOverridden ||
      dateControl.afterLastDeadline.isOverridden ||
      dateControl.durationMinutes.isOverridden ||
      dateControl.password.isOverridden
    : dateControl.enabled;

  const hasAnyDateControl =
    dateControl.dueDate.isEnabled ||
    dateControl.earlyDeadlines.isOverridden ||
    dateControl.lateDeadlines.isOverridden;

  return (
    <Card className="mb-4">
      <Card.Header>
        <div>
          {!isOverrideRule ? (
            <Form.Check
              type="checkbox"
              id={`${namePrefix}-date-control-enabled`}
              label={title}
              {...register(getFieldName(namePrefix, 'dateControl.enabled'))}
              aria-describedby={`${namePrefix}-date-control-help`}
            />
          ) : (
            <div>{title}</div>
          )}
          <Form.Text id={`${namePrefix}-date-control-help`} className="text-muted">
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
        aria-disabled={!isOverrideRule && !dateControlEnabled ? true : undefined}
      >
        <div>
          <Row className="mb-3">
            <Col md={6}>
              <ReleaseDateField namePrefix={namePrefix} />
            </Col>
            <Col md={6}>
              <DueDateField namePrefix={namePrefix} />
            </Col>
          </Row>

          <Row className="mb-4">
            <Col md={6}>
              <DeadlineArrayField namePrefix={namePrefix} type="early" />
            </Col>
            <Col md={6}>
              <DeadlineArrayField namePrefix={namePrefix} type="late" />
            </Col>
          </Row>

          {!isOverrideRule && <hr className="my-4" />}

          {(isOverrideRule || hasAnyDateControl) && (
            <div className="mb-3">
              <AfterLastDeadlineField namePrefix={namePrefix} />
            </div>
          )}

          {!isOverrideRule && <hr className="my-4" />}

          <Row className="mb-3">
            <Col md={6}>
              <DurationField namePrefix={namePrefix} />
            </Col>
            <Col md={6}>
              <PasswordField namePrefix={namePrefix} />
            </Col>
          </Row>
        </div>
      </Card.Body>
    </Card>
  );
}
