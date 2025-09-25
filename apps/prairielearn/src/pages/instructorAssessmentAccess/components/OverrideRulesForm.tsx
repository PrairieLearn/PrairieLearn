import { useState } from 'preact/compat';
import { Button, Card, Col, Collapse, Form, Row } from 'react-bootstrap';
import {
  type Control,
  type FieldArrayWithId,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

interface OverrideRulesFormProps {
  control: Control<AccessControlFormData>;
  fields: FieldArrayWithId<AccessControlFormData, 'overrides', 'id'>[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  setValue: UseFormSetValue<AccessControlFormData>;
}

export function OverrideRulesForm({
  control,
  fields,
  onAdd,
  onRemove,
  setValue,
}: OverrideRulesFormProps) {
  // State for collapsible help section
  const [showHelp, setShowHelp] = useState(false);

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

      {/* Collapsible help section */}
      <div class="mb-3">
        <Button
          variant="link"
          size="sm"
          class="p-0 text-decoration-none"
          style={{ fontSize: '0.875rem' }}
          onClick={() => setShowHelp(!showHelp)}
        >
          How are overrides evaluated?
        </Button>
        <Collapse in={showHelp}>
          <div class="mt-2 p-3 border rounded bg-light">
            <div class="mb-3">
              <strong>Override Rule Priority:</strong> Override rules are evaluated in order. The
              first rule that matches a student's target groups will be applied. If no override rule
              matches, the main rule will be used.
            </div>
            <div>
              <strong>Inheritance:</strong> Override rules inherit settings from the main rule. Only
              the settings you explicitly configure here will override the main rule. Date control,
              PrairieTest control, and after-completion settings are inherited from the main rule.
            </div>
          </div>
        </Collapse>
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

      {fields.map((field, index) => {
        const override = watchedOverrides[index];
        const isEnabled = override?.enabled;
        const blockAccess = override?.blockAccess;

        return (
          <Card key={field.id} class="mb-4">
            <Card.Header class="d-flex justify-content-between align-items-center">
              <div>
                <strong>Override Rule {index + 1}</strong>
                <span class="ms-2 text-muted">
                  {isEnabled ? 'Enabled' : 'Disabled'}
                  {blockAccess && ' • Blocks Access'}
                </span>
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
                {isEnabled && (
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      label="Block access"
                      {...control.register(`overrides.${index}.blockAccess`)}
                    />
                    <Form.Text class="text-muted">Deny access if this rule applies</Form.Text>
                  </Col>
                )}
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
                  Comma-separated list of target identifiers that this rule applies to (e.g.,
                  section names, user groups).
                </Form.Text>
              </div>

              {/* Effects Section - Only show if rule is enabled and doesn't block access */}
              {isEnabled && !blockAccess && (
                <div class="mb-3">
                  <h6 class="mb-3">Override Settings</h6>

                  {/* Date Control Section */}
                  <DateControlForm
                    control={control}
                    namePrefix={`overrides.${index}`}
                    setValue={setValue}
                    showOverrideButton={override?.dateControl?.enabled === undefined}
                    title="Date Control"
                    description="Control access and credit to your exam based on a schedule"
                    collapsible={true}
                    defaultExpanded={true}
                    onOverride={() => {
                      setValue(`overrides.${index}.dateControl.enabled`, true);
                      setValue(`overrides.${index}.dateControl.releaseDateEnabled`, true);
                      setValue(`overrides.${index}.dateControl.dueDateEnabled`, true);
                    }}
                  />

                  {/* After Completion Behavior Section */}
                  <AfterCompleteForm
                    control={control}
                    namePrefix={`overrides.${index}`}
                    setValue={setValue}
                    showOverrideButton={
                      override?.afterComplete?.hideQuestions === undefined &&
                      override?.afterComplete?.hideScore === undefined
                    }
                    title="After Completion Behavior"
                    description="Configure what happens after students complete the assessment"
                    collapsible={true}
                    defaultExpanded={true}
                    onOverride={() => {
                      setValue(`overrides.${index}.afterComplete.hideQuestions`, true);
                      setValue(`overrides.${index}.afterComplete.hideScore`, true);
                    }}
                  />

                  {/* PrairieTest Integration Section */}
                  <PrairieTestControlForm
                    control={control}
                    namePrefix={`overrides.${index}`}
                    showOverrideButton={override?.prairieTestControl?.enabled === undefined}
                    title="PrairieTest Integration"
                    description="Integrate with PrairieTest exams for access control"
                    collapsible={true}
                    defaultExpanded={true}
                    onOverride={() => {
                      setValue(`overrides.${index}.prairieTestControl.enabled`, true);
                    }}
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        );
      })}
    </div>
  );
}
