import { useState } from 'preact/compat';
import { Accordion, Button, Card, Form } from 'react-bootstrap';
import { type Control, useFieldArray, useForm } from 'react-hook-form';

import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { OverrideRulesForm } from './OverrideRulesForm.js';
import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJson[];
  onSubmit: (data: AccessControlJson[]) => void;
}

const defaultInitialData: AccessControlJson[] = [];

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
}: AccessControlFormProps) {
  const [activeKey, setActiveKey] = useState<string>('main-rule');

  // Separate main rule from overrides
  const mainRule = initialData[0];

  const overrides = initialData.slice(1);

  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty },
  } = useForm<AccessControlFormData>({
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const {
    fields: overrideFields,
    append: appendOverride,
    remove: removeOverride,
  } = useFieldArray({
    control,
    name: 'overrides',
  });

  const watchedData = watch();

  const handleFormSubmit = (data: AccessControlFormData) => {
    // Combine main rule and overrides into a single array
    const allRules = [data.mainRule, ...data.overrides];
    onSubmit(allRules);
  };

  const addOverride = () => {
    appendOverride({
      enabled: true,
      blockAccess: false,
      targets: [],
    });
  };

  return (
    <div>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        <Accordion activeKey={activeKey} onSelect={(e) => setActiveKey(e as string)}>
          {/* Main Rule */}
          <Accordion.Item eventKey="main-rule">
            <Accordion.Header>
              <strong>Main Access Control Rule</strong>
              <span class="ms-2 text-muted">
                {watchedData.mainRule?.enabled ? 'Enabled' : 'Disabled'}
                {watchedData.mainRule?.blockAccess && ' • Blocks Access'}
              </span>
            </Accordion.Header>
            <Accordion.Body>
              <MainRuleForm control={control} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Override Rules */}
          <Accordion.Item eventKey="overrides">
            <Accordion.Header>
              <strong>Override Rules</strong>
              <span class="ms-2 text-muted">
                {overrideFields.length} rule{overrideFields.length !== 1 ? 's' : ''}
              </span>
            </Accordion.Header>
            <Accordion.Body>
              <OverrideRulesForm
                control={control}
                fields={overrideFields}
                onAdd={addOverride}
                onRemove={removeOverride}
              />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>

        <div class="mt-4 d-flex gap-2">
          <Button type="submit" variant="primary" disabled={!isDirty}>
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => window.location.reload()}
          >
            Reset
          </Button>
        </div>
      </Form>

      {/* Debug Display */}
      <Card class="mt-4">
        <Card.Header>
          <strong>Form State (Debug)</strong>
        </Card.Header>
        <Card.Body>
          <pre class="mb-0" style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}>
            <code>{JSON.stringify(watchedData, null, 2)}</code>
          </pre>
        </Card.Body>
      </Card>
    </div>
  );
}

function MainRuleForm({ control }: { control: Control<AccessControlFormData> }) {
  return (
    <div>
      <Form.Group class="mb-3">
        <Form.Check
          type="checkbox"
          label="Enable this access rule"
          {...control.register('mainRule.enabled')}
        />
      </Form.Group>

      <Form.Group class="mb-3">
        <Form.Check
          type="checkbox"
          label="Block access"
          {...control.register('mainRule.blockAccess')}
        />
        <Form.Text class="text-muted">Deny access if this rule applies</Form.Text>
      </Form.Group>

      <Form.Group class="mb-3">
        <Form.Check
          type="checkbox"
          label="List before release"
          {...control.register('mainRule.listBeforeRelease')}
        />
        <Form.Text class="text-muted">
          Students can see the title and click into assessment before release
        </Form.Text>
      </Form.Group>

      <DateControlForm control={control} namePrefix="mainRule.dateControl" />
      <PrairieTestControlForm control={control} namePrefix="mainRule.prairieTestControl" />
      <AfterCompleteForm control={control} namePrefix="mainRule.afterComplete" />
    </div>
  );
}
