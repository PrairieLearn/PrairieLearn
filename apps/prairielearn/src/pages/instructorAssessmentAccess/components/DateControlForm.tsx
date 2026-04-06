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
import { startOfDayDatetime } from './utils/dateUtils.js';

export function MainDateControlForm({
  title = 'Date control',
  description = 'Control access and credit to your assessment based on a schedule',
}: {
  title?: string;
  description?: string;
}) {
  const { register, setValue, getValues } = useFormContext<AccessControlFormData>();

  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
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
              if (e.target.checked && !getValues('mainRule.releaseDate')) {
                setValue('mainRule.releaseDate', startOfDayDatetime(), {
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
          <MainReleaseDateField />
          <MainDeadlineArrayField type="early" />
          <MainDueDateField />
          <MainDeadlineArrayField type="late" />
          <MainAfterLastDeadlineField />
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
}: {
  index: number;
  title?: string;
  description?: string;
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
        <OverrideReleaseDateField index={index} />
        <OverrideDeadlineArrayField index={index} type="early" />
        <OverrideDueDateField index={index} />
        <OverrideDeadlineArrayField index={index} type="late" />
        <OverrideAfterLastDeadlineField index={index} />
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
