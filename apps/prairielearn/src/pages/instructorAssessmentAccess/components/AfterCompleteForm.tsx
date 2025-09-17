import { Card, Col, Form, Row } from 'react-bootstrap';
import { type Control } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.afterComplete' | `overrides.${number}.afterComplete`;
}

export function AfterCompleteForm({ control, namePrefix }: AfterCompleteFormProps) {
  return (
    <Card class="mb-4">
      <Card.Header>
        <h6 class="mb-0">After Completion Behavior</h6>
      </Card.Header>
      <Card.Body>
        {/* Hide Questions */}
        <Card class="mb-3">
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Questions After Completion"
              {...control.register(`${namePrefix}.hideQuestions`)}
            />
          </Card.Header>
          <Card.Body>
            <Row class="mb-2">
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Enable Show Again Date"
                  {...control.register(
                    `${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`,
                  )}
                />
              </Col>
              <Col md={6}>
                <Form.Control
                  type="datetime-local"
                  placeholder="Show Again Date"
                  {...control.register(`${namePrefix}.hideQuestionsDateControl.showAgainDate`)}
                />
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Enable Hide Again Date"
                  {...control.register(
                    `${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`,
                  )}
                />
              </Col>
              <Col md={6}>
                <Form.Control
                  type="datetime-local"
                  placeholder="Hide Again Date"
                  {...control.register(`${namePrefix}.hideQuestionsDateControl.hideAgainDate`)}
                />
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Hide Score */}
        <Card>
          <Card.Header>
            <Form.Check
              type="checkbox"
              label="Hide Score After Completion"
              {...control.register(`${namePrefix}.hideScore`)}
            />
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Enable Show Again Date"
                  {...control.register(`${namePrefix}.hideScoreDateControl.showAgainDateEnabled`)}
                />
              </Col>
              <Col md={6}>
                <Form.Control
                  type="datetime-local"
                  placeholder="Show Again Date"
                  {...control.register(`${namePrefix}.hideScoreDateControl.showAgainDate`)}
                />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Card.Body>
    </Card>
  );
}
