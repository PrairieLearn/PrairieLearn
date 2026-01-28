import { Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import {
  AfterLastDeadlineField,
  DeadlineArrayField,
  DueDateField,
  DurationField,
  PasswordField,
  ReleaseDateField,
} from './fields/index.js';
import {
  type NamePrefix,
  getFieldName,
  useWatchField,
  useWatchOverridableField,
} from './hooks/useTypedFormWatch.js';
import type { AccessControlFormData } from './types.js';

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
  const dateControlEnabledField = useWatchField<boolean>(
    control,
    namePrefix,
    'dateControl.enabled',
  );

  // Watch fields to determine if any override is active (for override rules)
  const releaseDate = useWatchOverridableField<string>(
    control,
    namePrefix,
    'dateControl.releaseDate',
  );

  const dueDate = useWatchOverridableField<string>(control, namePrefix, 'dateControl.dueDate');

  const earlyDeadlines = useWatchOverridableField<unknown>(
    control,
    namePrefix,
    'dateControl.earlyDeadlines',
  );

  const lateDeadlines = useWatchOverridableField<unknown>(
    control,
    namePrefix,
    'dateControl.lateDeadlines',
  );

  const afterLastDeadline = useWatchOverridableField<unknown>(
    control,
    namePrefix,
    'dateControl.afterLastDeadline',
  );

  const durationMinutes = useWatchOverridableField<unknown>(
    control,
    namePrefix,
    'dateControl.durationMinutes',
  );

  const password = useWatchOverridableField<unknown>(control, namePrefix, 'dateControl.password');

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
    <Card className="mb-4">
      <Card.Header>
        <div>
          <div className="d-flex align-items-center">
            {!isOverrideRule && (
              <Form.Check
                type="checkbox"
                className="me-2"
                {...control.register(getFieldName(namePrefix, 'dateControl.enabled'))}
              />
            )}
            <span>{title}</span>
          </div>
          <Form.Text className="text-muted">
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
          <Row className="mb-3">
            <Col md={6}>
              <ReleaseDateField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
            <Col md={6}>
              <DueDateField control={control} setValue={setValue} namePrefix={namePrefix} />
            </Col>
          </Row>

          {/* Early and Late Deadlines */}
          <Row className="mb-4">
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

          {!isOverrideRule && <hr className="my-4" />}

          {/* After Last Deadline - show when dates are configured or it's an override rule */}
          {(isOverrideRule || hasAnyDateControl) && (
            <div className="mb-3">
              <AfterLastDeadlineField
                control={control}
                setValue={setValue}
                namePrefix={namePrefix}
              />
            </div>
          )}

          {!isOverrideRule && <hr className="my-4" />}

          {/* Duration and Password */}
          <Row className="mb-3">
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
