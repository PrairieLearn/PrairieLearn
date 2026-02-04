import { Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData, OverridableField } from './types.js';

interface MainRuleFormProps {
  control: Control<AccessControlFormData>;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  setValue: UseFormSetValue<AccessControlFormData>;
}

export function MainRuleForm({
  control,
  courseInstance: _courseInstance,
  setValue,
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

  // Watch actual field values to determine if controls are active
  const releaseDate = useWatch({
    control,
    name: 'mainRule.dateControl.releaseDate',
  }) as OverridableField<string> | undefined;

  // Watch PrairieTest exams
  const prairieTestExams = useWatch({
    control,
    name: 'mainRule.prairieTestControl.exams',
    defaultValue: [],
  });

  // Check if date-based release is available (has a release date enabled)
  const hasDateRelease = releaseDate?.isEnabled ?? false;

  // Check if PrairieTest-based release is available
  const hasPrairieTestRelease = (prairieTestExams?.length ?? 0) > 0;

  return (
    <div>
      {ruleEnabled && (
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            label="Block access"
            {...control.register('mainRule.blockAccess')}
          />
          <Form.Text className="text-muted">Deny access if this rule applies</Form.Text>
        </Form.Group>
      )}

      {ruleEnabled && !blockAccess && (
        <>
          {(hasDateRelease || hasPrairieTestRelease) && (
            <Form.Group className="mb-3">
              <div className="d-flex align-items-center mb-2">
                <Form.Check
                  type="checkbox"
                  className="me-2"
                  {...control.register('mainRule.listBeforeRelease')}
                />
                <span>List before release</span>
              </div>
              <Form.Text className="text-muted">
                Students can see the title and click into assessment before release
              </Form.Text>
            </Form.Group>
          )}

          <DateControlForm control={control} setValue={setValue} />
          <PrairieTestControlForm control={control} namePrefix="mainRule" setValue={setValue} />

          <AfterCompleteForm control={control} namePrefix="mainRule" setValue={setValue} />
        </>
      )}
    </div>
  );
}
