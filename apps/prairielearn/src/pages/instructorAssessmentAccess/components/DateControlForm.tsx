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

interface MainDateControlFormProps {
  title?: string;
  description?: string;
}

export function MainDateControlForm({
  title = 'Date control',
  description = 'Control access and credit to your exam based on a schedule',
}: MainDateControlFormProps) {
  const { register } = useFormContext<AccessControlFormData>();

  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });

  const dueDate = useWatch<AccessControlFormData, 'mainRule.dueDate'>({
    name: 'mainRule.dueDate',
  });

  const hasAnyDateControl = dueDate !== null;

  return (
    <Card className="mb-4">
      <Card.Header>
        <div>
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
        </div>
      </Card.Header>
      <Card.Body
        style={{
          opacity: dateControlEnabled ? 1 : 0.5,
          pointerEvents: dateControlEnabled ? 'auto' : 'none',
        }}
        aria-disabled={!dateControlEnabled ? true : undefined}
      >
        <div>
          <Row className="mb-3">
            <Col md={6}>
              <MainReleaseDateField />
            </Col>
            <Col md={6}>
              <MainDueDateField />
            </Col>
          </Row>

          <Row className="mb-4">
            <Col md={6}>
              <MainDeadlineArrayField type="early" />
            </Col>
            <Col md={6}>
              <MainDeadlineArrayField type="late" />
            </Col>
          </Row>

          <hr className="my-4" />

          {hasAnyDateControl && (
            <div className="mb-3">
              <MainAfterLastDeadlineField />
            </div>
          )}

          <hr className="my-4" />

          <Row className="mb-3">
            <Col md={6}>
              <MainDurationField />
            </Col>
            <Col md={6}>
              <MainPasswordField />
            </Col>
          </Row>
        </div>
      </Card.Body>
    </Card>
  );
}

interface OverrideDateControlFormProps {
  index: number;
  title?: string;
  description?: string;
}

export function OverrideDateControlForm({
  index,
  title = 'Date control',
  description = 'Override date settings from the main rule by clicking "Override" on individual fields',
}: OverrideDateControlFormProps) {
  return (
    <Card className="mb-4">
      <Card.Header>
        <div>
          <div>{title}</div>
          <Form.Text className="text-muted">{description}</Form.Text>
        </div>
      </Card.Header>
      <Card.Body>
        <div>
          <Row className="mb-3">
            <Col md={6}>
              <OverrideReleaseDateField index={index} />
            </Col>
            <Col md={6}>
              <OverrideDueDateField index={index} />
            </Col>
          </Row>

          <Row className="mb-4">
            <Col md={6}>
              <OverrideDeadlineArrayField index={index} type="early" />
            </Col>
            <Col md={6}>
              <OverrideDeadlineArrayField index={index} type="late" />
            </Col>
          </Row>

          <div className="mb-3">
            <OverrideAfterLastDeadlineField index={index} />
          </div>

          <Row className="mb-3">
            <Col md={6}>
              <OverrideDurationField index={index} />
            </Col>
            <Col md={6}>
              <OverridePasswordField index={index} />
            </Col>
          </Row>
        </div>
      </Card.Body>
    </Card>
  );
}
