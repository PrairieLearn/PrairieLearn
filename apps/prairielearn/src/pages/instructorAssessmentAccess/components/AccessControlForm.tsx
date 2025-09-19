import { useState, useEffect } from 'preact/compat';
import { Accordion, Button, Card, Form } from 'react-bootstrap';
import {
  type Control,
  type UseFormTrigger,
  type UseFormSetValue,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';

import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';
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
    setError,
    clearErrors,
    formState: { isDirty, errors },
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

  // Watch for changes in Date Control and PrairieTest Control to clear validation errors
  const dateControlEnabled = useWatch({
    control,
    name: 'mainRule.dateControl.enabled',
  });

  const prairieTestControlEnabled = useWatch({
    control,
    name: 'mainRule.prairieTestControl.enabled',
  });

  // Clear validation error when either control is enabled
  useEffect(() => {
    if (dateControlEnabled || prairieTestControlEnabled) {
      clearErrors('mainRule.dateControl.enabled');
    }
  }, [dateControlEnabled, prairieTestControlEnabled, clearErrors]);

  const handleFormSubmit = (data: AccessControlFormData) => {
    // Clear any existing validation errors
    clearErrors('mainRule.dateControl.enabled');

    // Validate that either Date Control or PrairieTest Control is enabled
    if (data.mainRule?.enabled && !data.mainRule?.blockAccess) {
      const dateControlEnabled = data.mainRule?.dateControl?.enabled;
      const prairieTestControlEnabled = data.mainRule?.prairieTestControl?.enabled;

      if (!dateControlEnabled && !prairieTestControlEnabled) {
        setError('mainRule.dateControl.enabled', {
          type: 'manual',
          message: 'Either Date Control or PrairieTest Control must be enabled',
        });
        return;
      }
    }

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
  courseInstance,
  setValue,
  errors,
}: {
  control: Control<AccessControlFormData>;
  trigger: UseFormTrigger<AccessControlFormData>;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  setValue: UseFormSetValue<AccessControlFormData>;
  errors: any;
}) {
  // Watch the main rule enabled state
  const ruleEnabled = useWatch({
    control,
    name: 'mainRule.enabled',
  });

  // Watch block access state
  const blockAccess = useWatch({
    control,
    name: 'mainRule.blockAccess',
  });

  // Watch Date Control enabled state
  const dateControlEnabled = useWatch({
    control,
    name: 'mainRule.dateControl.enabled',
  });

  // Watch release date enabled state
  const releaseDateEnabled = useWatch({
    control,
    name: 'mainRule.dateControl.releaseDateEnabled' as const,
    defaultValue: false,
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

  return (
    <div>
      <Form.Group class="mb-3">
        <Form.Check
          type="checkbox"
          label="Enable this access rule"
          {...control.register('mainRule.enabled')}
        />
      </Form.Group>

      {ruleEnabled && (
        <>
          <Form.Group class="mb-3">
            <Form.Check
              type="checkbox"
              label="Block access"
              {...control.register('mainRule.blockAccess')}
            />
            <Form.Text class="text-muted">Deny access if this rule applies</Form.Text>
          </Form.Group>

          {!blockAccess && (
            <>
              {(hasDateRelease || hasPrairieTestRelease) &&
                !(dateControlEnabled && !releaseDateEnabled) && (
                  <Form.Group class="mb-3">
                    <div class="d-flex align-items-center mb-2">
                      <TriStateCheckbox
                        control={control}
                        name="mainRule.listBeforeRelease"
                        class="me-2"
                      />
                      <span>List before release</span>
                    </div>
                    <Form.Text class="text-muted">
                      Students can see the title and click into assessment before release
                    </Form.Text>
                  </Form.Group>
                )}

              <DateControlForm
                control={control}
                trigger={trigger}
                courseInstance={courseInstance}
                setValue={setValue}
              />
              <PrairieTestControlForm
                control={control}
                namePrefix="mainRule"
                ruleEnabled={ruleEnabled}
              />

              {/* Display validation error if neither Date Control nor PrairieTest Control is enabled */}
              {errors?.mainRule?.dateControl?.enabled?.message && (
                <div class="alert alert-danger" role="alert">
                  {errors.mainRule.dateControl.enabled.message}
                </div>
              )}
              <AfterCompleteForm
                control={control}
                namePrefix="mainRule"
                ruleEnabled={ruleEnabled}
                setValue={setValue}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
