import { Badge, Button, Card, Col, Form, Row } from 'react-bootstrap';
import { type Control, type FieldArrayWithId, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface OverrideRulesFormProps {
  control: Control<AccessControlFormData>;
  fields: FieldArrayWithId<AccessControlFormData, 'overrides', 'id'>[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function OverrideRulesForm({ control, fields, onAdd, onRemove }: OverrideRulesFormProps) {
  // Note: Target management is simplified for this implementation
  // In a full implementation, you'd need to manage targets per override rule

  // Watch the entire overrides array to get current values for display
  const watchedOverrides = useWatch({
    control,
    name: 'overrides',
    defaultValue: [],
  });

  return (
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="mb-0">Override Rules</h6>
        <Button size="sm" variant="primary" onClick={onAdd}>
          Add Override Rule
        </Button>
      </div>

      {fields.length === 0 && (
        <div class="text-muted text-center py-4">
          <p>No override rules configured.</p>
          <p>
            Override rules allow you to create specific access controls for different groups of
            students.
          </p>
        </div>
      )}

      {fields.map((field, index) => (
        <Card key={field.id} class="mb-3">
          <Card.Header class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Override Rule {index + 1}</strong>
              <div class="mt-1">
                {watchedOverrides[index]?.enabled ? (
                  <Badge bg="success">Enabled</Badge>
                ) : (
                  <Badge bg="secondary">Disabled</Badge>
                )}
                {watchedOverrides[index]?.blockAccess && (
                  <Badge bg="danger" class="ms-1">
                    Blocks Access
                  </Badge>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline-danger" onClick={() => onRemove(index)}>
              Remove Rule
            </Button>
          </Card.Header>
          <Card.Body>
            <Row class="mb-3">
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Enable this override rule"
                  {...control.register(`overrides.${index}.enabled`)}
                />
              </Col>
              <Col md={6}>
                <Form.Check
                  type="checkbox"
                  label="Block access"
                  {...control.register(`overrides.${index}.blockAccess`)}
                />
                <Form.Text class="text-muted">Deny access if this rule applies</Form.Text>
              </Col>
            </Row>

            {/* Targets */}
            <div class="mb-3">
              <Form.Label>Target Groups</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter target identifiers (e.g., sectionA, sectionB) separated by commas"
                {...control.register(`overrides.${index}.targets`)}
              />
              <Form.Text class="text-muted">
                Comma-separated list of target identifiers that this rule applies to (e.g., section
                names, user groups).
              </Form.Text>
            </div>

            {/* Inherited Settings */}
            <div class="mb-3">
              <Form.Check
                type="checkbox"
                label="List before release"
                {...control.register(`overrides.${index}.listBeforeRelease`)}
              />
              <Form.Text class="text-muted">Inherited from main rule</Form.Text>
            </div>

            {/* Note about inheritance */}
            <div class="alert alert-info">
              <small>
                <strong>Note:</strong> Override rules inherit settings from the main rule. Only the
                settings you explicitly configure here will override the main rule. Date control,
                PrairieTest control, and after-completion settings are inherited from the main rule.
              </small>
            </div>
          </Card.Body>
        </Card>
      ))}

      {fields.length > 0 && (
        <div class="alert alert-warning">
          <small>
            <strong>Override Rule Priority:</strong> Override rules are evaluated in order. The
            first rule that matches a student's target groups will be applied. If no override rule
            matches, the main rule will be used.
          </small>
        </div>
      )}
    </div>
  );
}
