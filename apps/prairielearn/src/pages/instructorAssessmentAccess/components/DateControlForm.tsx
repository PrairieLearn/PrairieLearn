import { Col, Form, Row } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import {
  MainAfterLastDeadlineField,
  OverrideAfterLastDeadlineField,
} from './fields/AfterLastDeadlineField.js';
import { MainDeadlineArrayField, OverrideDeadlineArrayField } from './fields/DeadlineArrayField.js';
import { MainDueDateField, OverrideDueDateField } from './fields/DueDateField.js';
import { MainDurationField, OverrideDurationField } from './fields/DurationField.js';
import { MainPasswordField, OverridePasswordField } from './fields/PasswordField.js';
import { MainReleaseDateField, OverrideReleaseDateField } from './fields/ReleaseDateField.js';
import type { AccessControlFormData } from './types.js';
import { startOfDayDatetime, todayDate } from './utils/dateUtils.js';

export function MainDateControlForm({
  title = 'Date control',
  description = 'Control access and credit to your assessment based on a schedule',
  displayTimezone,
  assessmentId,
  courseInstanceId,
}: {
  title?: string;
  description?: string;
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const { register, setValue, getValues } = useFormContext<AccessControlFormData>();

  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });

  const dueDate = useWatch<AccessControlFormData, 'mainRule.due.date'>({
    name: 'mainRule.due.date',
  });

  return (
    <div>
      <div className="section-header mb-3">
        <Form.Check
          type="checkbox"
          id="mainRule-date-control-enabled"
          label={<strong>{title}</strong>}
          {...register('mainRule.dateControlEnabled', {
            onChange: (e) => {
              if (e.target.checked && !getValues('mainRule.release.date')) {
                setValue('mainRule.release.date', startOfDayDatetime(todayDate(displayTimezone)), {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            },
          })}
          aria-describedby="mainRule-date-control-help"
        />
        <Form.Text id="mainRule-date-control-help" className="text-muted">
          {description}
        </Form.Text>
      </div>
      {dateControlEnabled ? (
        <div className="d-flex flex-column gap-3">
          <MainReleaseDateField displayTimezone={displayTimezone} />
          <MainDeadlineArrayField type="early" displayTimezone={displayTimezone} />
          <MainDueDateField
            displayTimezone={displayTimezone}
            assessmentId={assessmentId}
            courseInstanceId={courseInstanceId}
          />
          <MainDeadlineArrayField type="late" displayTimezone={displayTimezone} />
          {dueDate != null && <MainAfterLastDeadlineField displayTimezone={displayTimezone} />}
          <Row className="gy-3">
            <Col md={6}>
              <MainDurationField />
            </Col>
            <Col md={6}>
              <MainPasswordField />
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
  assessmentId,
  courseInstanceId,
}: {
  index: number;
  title?: string;
  description?: string;
  displayTimezone: string;
  assessmentId: string;
  courseInstanceId: string;
}) {
  const mainDueDate = useWatch<AccessControlFormData, 'mainRule.due.date'>({
    name: 'mainRule.due.date',
  });
  const overrides = useWatch<AccessControlFormData, 'overrides'>({
    name: 'overrides',
  });
  // An override's late deadlines and afterLastDeadline are valid as long as
  // *any* rule in the configuration provides a due date (main rule or any
  // override), because overrides can stack — one override may set a due date
  // while another sets afterLastDeadline.
  const anyRuleHasDueDate =
    mainDueDate != null ||
    overrides.some((o) => o.overriddenFields.includes('due') && o.due.date != null);

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
        <OverrideDueDateField
          index={index}
          displayTimezone={displayTimezone}
          assessmentId={assessmentId}
          courseInstanceId={courseInstanceId}
        />
        {anyRuleHasDueDate && (
          <>
            <OverrideDeadlineArrayField
              index={index}
              type="late"
              displayTimezone={displayTimezone}
            />
            <OverrideAfterLastDeadlineField index={index} displayTimezone={displayTimezone} />
          </>
        )}
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
