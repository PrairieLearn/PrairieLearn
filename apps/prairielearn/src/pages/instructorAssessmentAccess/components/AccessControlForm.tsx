import { useState } from 'preact/compat';
import { Accordion, Button, Card, Form } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRulesForm } from './OverrideRulesForm.js';
import type { AccessControlFormData } from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJson[];
  onSubmit: (data: AccessControlJson[]) => void;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
}

const defaultInitialData: AccessControlJson[] = [];

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
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
    setValue,
    formState: { isDirty, errors, isValid },
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
      dateControl: {
        releaseDateEnabled: false,
      },
      prairieTestControl: {},
      afterComplete: {},
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
              <MainRuleForm
                control={control}
                trigger={trigger}
                courseInstance={courseInstance}
                setValue={setValue}
                errors={errors}
              />
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
                setValue={setValue}
              />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>

        <div class="mt-4 d-flex gap-2">
          <Button type="submit" variant="primary" disabled={!isDirty || !isValid}>
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
