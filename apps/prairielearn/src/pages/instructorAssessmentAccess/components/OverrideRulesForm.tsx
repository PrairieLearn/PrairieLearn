import { Button, Card, Col, Form, Row, Collapse } from 'react-bootstrap';
import {
  type Control,
  type FieldArrayWithId,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import { useState } from 'preact/compat';

import type { AccessControlFormData } from './types.js';
import { EFFECT_OPTIONS, renderEffect, type EffectType } from './FormComponents.js';

interface OverrideRulesFormProps {
  control: Control<AccessControlFormData>;
  fields: FieldArrayWithId<AccessControlFormData, 'overrides', 'id'>[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  setValue: UseFormSetValue<AccessControlFormData>;
}

// Track active effects for each override rule
interface OverrideEffects {
  [overrideIndex: number]: EffectType[];
}

export function OverrideRulesForm({
  control,
  fields,
  onAdd,
  onRemove,
  setValue,
}: OverrideRulesFormProps) {
  // Note: Target management is simplified for this implementation
  // In a full implementation, you'd need to manage targets per override rule

  // Track active effects for each override rule
  const [overrideEffects, setOverrideEffects] = useState<OverrideEffects>({});
  const [selectedEffects, setSelectedEffects] = useState<{ [overrideIndex: number]: EffectType }>(
    {},
  );

  // State for collapsible help section
  const [showHelp, setShowHelp] = useState(false);

  // Watch the entire overrides array to get current values for display
  const watchedOverrides = useWatch({
    control,
    name: 'overrides',
    defaultValue: [],
  });

  // Add effect to an override rule
  const addEffectToOverride = (overrideIndex: number) => {
    const selectedEffect = selectedEffects[overrideIndex];
    if (!selectedEffect) return;

    const currentEffects = overrideEffects[overrideIndex] || [];
    if (currentEffects.includes(selectedEffect)) return; // Effect already exists

    setOverrideEffects({
      ...overrideEffects,
      [overrideIndex]: [...currentEffects, selectedEffect],
    });

    // Clear the selected effect
    setSelectedEffects({
      ...selectedEffects,
      [overrideIndex]: 'dateControlEnabled', // Reset to first option
    });
  };

  // Remove effect from an override rule
  const removeEffectFromOverride = (overrideIndex: number, effectType: EffectType) => {
    const currentEffects = overrideEffects[overrideIndex] || [];
    setOverrideEffects({
      ...overrideEffects,
      [overrideIndex]: currentEffects.filter((effect) => effect !== effectType),
    });
  };

  // Get available effects for an override (exclude already added ones)
  const getAvailableEffects = (overrideIndex: number) => {
    const currentEffects = overrideEffects[overrideIndex] || [];
    return EFFECT_OPTIONS.filter((option) => !currentEffects.includes(option.value as EffectType));
  };

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
          onClick={() => setShowHelp(!showHelp)}
          class="p-0 text-decoration-none"
          style={{ fontSize: '0.875rem' }}
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

      {fields.map((field, index) => (
        <Card key={field.id} class="mb-3">
          <Card.Header class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Override Rule {index + 1}</strong>
              <span class="ms-2 text-muted">
                {watchedOverrides[index]?.enabled ? 'Enabled' : 'Disabled'}
                {watchedOverrides[index]?.blockAccess && ' • Blocks Access'}
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

            {/* Effects Section */}
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0">Effects</h6>
                <div class="d-flex gap-2">
                  <Form.Select
                    size="sm"
                    value={selectedEffects[index] || 'dateControlEnabled'}
                    onChange={(e) =>
                      setSelectedEffects({
                        ...selectedEffects,
                        [index]: (e.target as HTMLSelectElement).value as EffectType,
                      })
                    }
                    style={{ width: '200px' }}
                  >
                    {getAvailableEffects(index).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Form.Select>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={() => addEffectToOverride(index)}
                    disabled={getAvailableEffects(index).length === 0}
                  >
                    Add Effect
                  </Button>
                </div>
              </div>

              {/* Render active effects */}
              {overrideEffects[index]?.length ? (
                <>
                  {overrideEffects[index].map((effectType) => (
                    <Card key={effectType} class="mb-3">
                      <Card.Header class="d-flex justify-content-between align-items-center py-2">
                        <span>{EFFECT_OPTIONS.find((opt) => opt.value === effectType)?.label}</span>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => removeEffectFromOverride(index, effectType)}
                        >
                          Remove
                        </Button>
                      </Card.Header>
                      <Card.Body>
                        {renderEffect(effectType, {
                          control,
                          namePrefix: `overrides.${index}`,
                          setValue,
                          disabled: !watchedOverrides[index]?.enabled,
                        })}
                      </Card.Body>
                    </Card>
                  ))}
                </>
              ) : (
                <div class="text-muted text-center py-3 border rounded">
                  <p class="mb-0">No effects configured.</p>
                  <small>Add effects to override specific settings from the main rule.</small>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}
