import { useState } from 'preact/compat';
import { Accordion, Button, Card, Form } from 'react-bootstrap';
import {
  type Control,
  type UseFormGetFieldState,
  type UseFormTrigger,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';

import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { OverrideRulesForm } from './OverrideRulesForm.js';
import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import { TriStateCheckbox } from './TriStateCheckbox.js';
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
    trigger,
    getFieldState,
    formState: { isDirty },
  } = useForm<AccessControlFormData>({
    mode: 'onChange',
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
              <MainRuleForm control={control} trigger={trigger} getFieldState={getFieldState} />
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

function MainRuleForm({
  control,
  trigger,
  getFieldState,
}: {
  control: Control<AccessControlFormData>;
  trigger: UseFormTrigger<AccessControlFormData>;
  getFieldState: UseFormGetFieldState<AccessControlFormData>;
}) {
  // Watch Date Control enabled state
  const dateControlEnabled = useWatch({
    control,
    name: 'mainRule.dateControl.enabled',
  });

  // Watch release date enabled state
  const releaseDateEnabled = useWatch({
    control,
    name: 'mainRule.dateControl.releaseDateEnabled',
  });

  // Watch PrairieTest Control enabled state
  const prairieTestControlEnabled = useWatch({
    control,
    name: 'mainRule.prairieTestControl.enabled',
  });

  // Watch PrairieTest exams
  const prairieTestExams = useWatch({
    control,
    name: 'mainRule.prairieTestControl.exams',
    defaultValue: [],
  });

  // Check if date-based release is available
  const hasDateRelease = dateControlEnabled && releaseDateEnabled;

  // Check if PrairieTest-based release is available
  const hasPrairieTestRelease = prairieTestControlEnabled && (prairieTestExams?.length ?? 0) > 0;

  // Determine if "List before release" should be disabled
  const isListBeforeReleaseDisabled = !hasDateRelease && !hasPrairieTestRelease;

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
        <div class="d-flex align-items-center mb-2">
          <TriStateCheckbox
            control={control}
            name="mainRule.listBeforeRelease"
            disabled={isListBeforeReleaseDisabled}
            disabledReason={
              isListBeforeReleaseDisabled
                ? 'Enable Date Control with Release Date or enable PrairieTest Control with exams'
                : undefined
            }
            class="me-2"
          />
          <span>List before release</span>
        </div>
        <Form.Text class="text-muted">
          Students can see the title and click into assessment before release
        </Form.Text>
      </Form.Group>

      <DateControlForm
        control={control}
        namePrefix="mainRule.dateControl"
        trigger={trigger}
        getFieldState={getFieldState}
      />
      <PrairieTestControlForm control={control} namePrefix="mainRule.prairieTestControl" />
      <AfterCompleteForm control={control} namePrefix="mainRule.afterComplete" />
    </div>
  );
}
