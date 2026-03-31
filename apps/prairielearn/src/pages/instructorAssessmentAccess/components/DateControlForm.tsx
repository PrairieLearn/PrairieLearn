import { Card, Col, Form, Row } from 'react-bootstrap';
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

export function MainDateControlForm({
  title = 'Date control',
  description = 'Control access and credit to your assessment based on a schedule',
}: {
  title?: string;
  description?: string;
}) {
  const { register } = useFormContext<AccessControlFormData>();

  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });

  return (
    <>
      <Card className="mb-4">
        <Card.Header>
          <Form.Check
            type="checkbox"
            id="mainRule-date-control-enabled"
            label={title}
            {...register('mainRule.dateControlEnabled')}
            aria-describedby="mainRule-date-control-help"
          />
          <Form.Text id="mainRule-date-control-help" className="text-muted">
            {description}
          </Form.Text>
        </Card.Header>
        {dateControlEnabled ? (
          <Card.Body>
            <div className="mb-3">
              <MainReleaseDateField />
            </div>
            <div className="mb-3">
              <MainDeadlineArrayField type="early" />
            </div>
            <div className="mb-3">
              <MainDueDateField />
            </div>
            <div className="mb-4">
              <MainDeadlineArrayField type="late" />
            </div>
          </Card.Body>
        ) : (
          <Card.Body>
            <p className="text-body-secondary mb-0">
              Enable date control to configure release dates, due dates, and deadlines.
            </p>
          </Card.Body>
        )}
      </Card>

      <div className="mb-3">
        <MainAfterLastDeadlineField />
      </div>

      <Row className="mb-3 gy-3">
        <Col md={6}>
          <MainDurationField />
        </Col>
        <Col md={6}>
          <MainPasswordField />
        </Col>
      </Row>
    </>
  );
}

export function OverrideDateControlForm({
  index,
  title = 'Date control',
  description = 'Override date settings from the main rule by clicking "Override" on individual fields',
}: {
  index: number;
  title?: string;
  description?: string;
}) {
  return (
    <Card className="mb-4">
      <Card.Header>
        <div>{title}</div>
        <Form.Text className="text-muted">{description}</Form.Text>
      </Card.Header>
      <Card.Body>
        <div className="mb-3">
          <OverrideReleaseDateField index={index} />
        </div>
        <div className="mb-3">
          <OverrideDeadlineArrayField index={index} type="early" />
        </div>
        <div className="mb-3">
          <OverrideDueDateField index={index} />
        </div>
        <div className="mb-4">
          <OverrideDeadlineArrayField index={index} type="late" />
        </div>

        <div className="mb-3">
          <OverrideAfterLastDeadlineField index={index} />
        </div>

        <Row className="mb-3 gy-3">
          <Col md={6}>
            <OverrideDurationField index={index} />
          </Col>
          <Col md={6}>
            <OverridePasswordField index={index} />
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
