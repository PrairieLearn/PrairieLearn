import { Col, Form, Row } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { useAccessControlCanEdit } from './AccessControlEditabilityContext.js';
import {
  DefaultAfterLastDeadlineField,
  OverrideAfterLastDeadlineField,
} from './fields/AfterLastDeadlineField.js';
import {
  DefaultDeadlineArrayField,
  OverrideDeadlineArrayField,
} from './fields/DeadlineArrayField.js';
import { DefaultDueDateField, OverrideDueDateField } from './fields/DueDateField.js';
import { DefaultDurationField, OverrideDurationField } from './fields/DurationField.js';
import { DefaultPasswordField, OverridePasswordField } from './fields/PasswordField.js';
import { DefaultReleaseDateField, OverrideReleaseDateField } from './fields/ReleaseDateField.js';
import type { AccessControlFormData } from './types.js';
import { startOfDayDatetime, todayDate } from './utils/dateUtils.js';

export function DefaultDateControlForm({
  title = 'Date control',
  description = 'Control access and credit to your assessment based on a schedule',
  displayTimezone,
}: {
  title?: string;
  description?: string;
  displayTimezone: string;
}) {
  const canEdit = useAccessControlCanEdit();
  const { register, setValue, getValues } = useFormContext<AccessControlFormData>();

  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });

  // Show late-deadline fields when a due date is set, OR when previously
  // configured late content exists. Preserving content lets the user fix or
  // intentionally clear it instead of having it silently wiped.
  const dueDate = useWatch<AccessControlFormData, 'defaultRule.due.date'>({
    name: 'defaultRule.due.date',
  });
  const lateDeadlines = useWatch<AccessControlFormData, 'defaultRule.lateDeadlines'>({
    name: 'defaultRule.lateDeadlines',
  });
  const afterLastDeadline = useWatch<AccessControlFormData, 'defaultRule.afterLastDeadline'>({
    name: 'defaultRule.afterLastDeadline',
  });
  const showLateFields = dueDate != null || lateDeadlines.length > 0 || afterLastDeadline != null;

  return (
    <div>
      <div className="section-header mb-3">
        <Form.Check
          type="checkbox"
          id="defaultRule-date-control-enabled"
          label={<strong>{title}</strong>}
          disabled={!canEdit}
          {...register('defaultRule.dateControlEnabled', {
            onChange: (e) => {
              if (e.target.checked && !getValues('defaultRule.release.date')) {
                setValue(
                  'defaultRule.release.date',
                  startOfDayDatetime(todayDate(displayTimezone)),
                  {
                    shouldDirty: true,
                    shouldValidate: true,
                  },
                );
                setValue('defaultRule.release.released', true, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            },
          })}
          aria-describedby="defaultRule-date-control-help"
        />
        <Form.Text id="defaultRule-date-control-help" className="text-muted">
          {description}
        </Form.Text>
      </div>
      {dateControlEnabled ? (
        <div className="d-flex flex-column gap-3">
          <DefaultReleaseDateField displayTimezone={displayTimezone} />
          <DefaultDeadlineArrayField type="early" displayTimezone={displayTimezone} />
          <DefaultDueDateField displayTimezone={displayTimezone} />
          {showLateFields && (
            <>
              <DefaultDeadlineArrayField type="late" displayTimezone={displayTimezone} />
              <DefaultAfterLastDeadlineField displayTimezone={displayTimezone} />
            </>
          )}
          <Row className="gy-3">
            <Col md={6}>
              <DefaultDurationField />
            </Col>
            <Col md={6}>
              <DefaultPasswordField />
            </Col>
          </Row>
        </div>
      ) : (
        <p className="text-body-secondary mt-2 mb-0">
          Enable date control to configure release dates, due dates, and deadlines.
        </p>
      )}
    </div>
  );
}

export function OverrideDateControlForm({
  index,
  title = 'Date control',
  description = 'Override date settings from the defaults by clicking "Override" on individual fields',
  displayTimezone,
}: {
  index: number;
  title?: string;
  description?: string;
  displayTimezone: string;
}) {
  return (
    <div>
      <div className="section-header mb-3">
        <div>
          <strong>{title}</strong>
        </div>
        <Form.Text className="text-muted">{description}</Form.Text>
      </div>
      <div className="d-flex flex-column gap-3">
        <OverrideReleaseDateField index={index} displayTimezone={displayTimezone} />
        <OverrideDeadlineArrayField index={index} type="early" displayTimezone={displayTimezone} />
        <OverrideDueDateField index={index} displayTimezone={displayTimezone} />
        <OverrideDeadlineArrayField index={index} type="late" displayTimezone={displayTimezone} />
        <OverrideAfterLastDeadlineField index={index} displayTimezone={displayTimezone} />
        <Row className="gy-3">
          <Col md={6}>
            <OverrideDurationField index={index} />
          </Col>
          <Col md={6}>
            <OverridePasswordField index={index} />
          </Col>
        </Row>
      </div>
    </div>
  );
}
