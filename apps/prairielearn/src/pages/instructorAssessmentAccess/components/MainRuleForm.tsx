import { Form } from 'react-bootstrap';
import { type Control, type UseFormTrigger, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

interface MainRuleFormProps {
  control: Control<AccessControlFormData>;
  trigger: UseFormTrigger<AccessControlFormData>;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  setValue: UseFormSetValue<AccessControlFormData>;
  errors: any;
}

export function MainRuleForm({
  control,
  trigger,
  courseInstance,
  setValue,
  errors,
}: MainRuleFormProps) {
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
              {(hasDateRelease || hasPrairieTestRelease) && (
                <Form.Group class="mb-3">
                  <div class="d-flex align-items-center mb-2">
                    <Form.Check
                      type="checkbox"
                      class="me-2"
                      {...control.register('mainRule.listBeforeRelease')}
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
