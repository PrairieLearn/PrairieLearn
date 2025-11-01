import { useState } from 'preact/compat';
import { Accordion, Button, Card, Form } from 'react-bootstrap';
import { useFieldArray, useForm } from 'react-hook-form';

import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRulesForm } from './OverrideRulesForm.js';
import {
  type AccessControlFormData,
  type AccessControlRuleFormData,
  formDataToJson,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJson[];
  onSubmit: (data: AccessControlJson[]) => void;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
}

const defaultInitialData: AccessControlJson[] = [];

/** Helper function to convert JSON to form data structure */
function jsonToFormData(json: AccessControlJson): AccessControlRuleFormData {
  return {
    enabled: json.enabled ?? true,
    blockAccess: json.blockAccess ?? false,
    listBeforeRelease: json.listBeforeRelease ?? true,
    targets: json.targets,
    dateControl: {
      enabled: json.dateControl?.enabled ?? false,
      releaseDate: json.dateControl?.releaseDate,
      dueDate: json.dateControl?.dueDate,
      earlyDeadlines: json.dateControl?.earlyDeadlines,
      lateDeadlines: json.dateControl?.lateDeadlines,
      afterLastDeadline: json.dateControl?.afterLastDeadline,
      durationMinutes: json.dateControl?.durationMinutes,
      password: json.dateControl?.password,
    },
    prairieTestControl: {
      enabled: json.prairieTestControl?.enabled ?? false,
      exams: json.prairieTestControl?.exams,
    },
    afterComplete: json.afterComplete,
  };
}

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
}: AccessControlFormProps) {
  const [activeKey, setActiveKey] = useState<string>('main-rule');

  // Separate main rule from overrides and convert to form data structure
  const mainRule = initialData[0]
    ? jsonToFormData(initialData[0])
    : jsonToFormData({ enabled: true, listBeforeRelease: true });
  const overrides = initialData.slice(1).map(jsonToFormData);

  const {
    control,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { isDirty, isValid },
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
    // Transform form data to JSON output
    const jsonOutput = formDataToJson(data);
    onSubmit(jsonOutput);
  };

  const addOverride = () => {
    appendOverride({
      enabled: true,
      blockAccess: false,
      listBeforeRelease: true,
      targets: [],
      dateControl: {
        enabled: false,
      },
      prairieTestControl: {
        enabled: false,
      },
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
                setValue={setValue}
                onAdd={addOverride}
                onRemove={removeOverride}
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

      {/* Debug Display - Show both form state and JSON output */}
      <Card class="mt-4">
        <Card.Header>
          <strong>Form State (Debug)</strong>
        </Card.Header>
        <Card.Body>
          <div class="mb-3">
            <strong>Internal Form Data:</strong>
            <pre
              class="mb-0 mt-2"
              style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}
            >
              <code>{JSON.stringify(watchedData, null, 2)}</code>
            </pre>
          </div>
          <div>
            <strong>JSON Output (what will be saved):</strong>
            <pre
              class="mb-0 mt-2"
              style={{ fontSize: '0.8rem', maxHeight: '400px', overflow: 'auto' }}
            >
              <code>{JSON.stringify(formDataToJson(watchedData), null, 2)}</code>
            </pre>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
