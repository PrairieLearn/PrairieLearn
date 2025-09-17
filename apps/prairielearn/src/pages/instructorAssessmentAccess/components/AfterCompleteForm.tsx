import { Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, useWatch } from 'react-hook-form';

import { TogglePill } from './TogglePill.js';
import type { AccessControlFormData } from './types.js';

interface AfterCompleteFormProps {
  control: Control<AccessControlFormData>;
  namePrefix: 'mainRule.afterComplete' | `overrides.${number}.afterComplete`;
}

export function AfterCompleteForm({ control, namePrefix }: AfterCompleteFormProps) {
  const hideQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestions`,
  });

  const hideScore = useWatch({
    control,
    name: `${namePrefix}.hideScore`,
  });

  const showAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`,
  });

  const hideAgainDateEnabledQuestions = useWatch({
    control,
    name: `${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`,
  });

  const showAgainDateEnabledScore = useWatch({
    control,
    name: `${namePrefix}.hideScoreDateControl.showAgainDateEnabled`,
  });

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
            <Row class="mb-3">
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <Form.Label class="mb-0 me-2">Show Again Date</Form.Label>
                    <TogglePill
                      control={control}
                      name={`${namePrefix}.hideQuestionsDateControl.showAgainDateEnabled`}
                      disabled={!hideQuestions}
                      disabledReason={!hideQuestions ? 'Enable Hide Questions first' : undefined}
                    />
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={!hideQuestions || !showAgainDateEnabledQuestions}
                    {...control.register(`${namePrefix}.hideQuestionsDateControl.showAgainDate`)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <Form.Label class="mb-0 me-2">Hide Again Date</Form.Label>
                    <TogglePill
                      control={control}
                      name={`${namePrefix}.hideQuestionsDateControl.hideAgainDateEnabled`}
                      disabled={!hideQuestions}
                      disabledReason={!hideQuestions ? 'Enable Hide Questions first' : undefined}
                    />
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Hide Again Date"
                    disabled={!hideQuestions || !hideAgainDateEnabledQuestions}
                    {...control.register(`${namePrefix}.hideQuestionsDateControl.hideAgainDate`)}
                  />
                </Form.Group>
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
                <Form.Group>
                  <div class="d-flex align-items-center mb-2">
                    <Form.Label class="mb-0 me-2">Show Again Date</Form.Label>
                    <TogglePill
                      control={control}
                      name={`${namePrefix}.hideScoreDateControl.showAgainDateEnabled`}
                      disabled={!hideScore}
                      disabledReason={!hideScore ? 'Enable Hide Score first' : undefined}
                    />
                  </div>
                  <Form.Control
                    type="datetime-local"
                    placeholder="Show Again Date"
                    disabled={!hideScore || !showAgainDateEnabledScore}
                    {...control.register(`${namePrefix}.hideScoreDateControl.showAgainDate`)}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Card.Body>
    </Card>
  );
}
