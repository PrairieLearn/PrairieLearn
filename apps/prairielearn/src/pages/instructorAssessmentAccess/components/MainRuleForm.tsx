import { Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { IntegrationsSection } from './IntegrationsSection.js';
import { useWatchOverridableField } from './hooks/useTypedFormWatch.js';
import type { AccessControlFormData } from './types.js';

interface MainRuleFormProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
}

export function MainRuleForm({ courseInstance: _courseInstance }: MainRuleFormProps) {
  const { register } = useFormContext<AccessControlFormData>();

  const ruleEnabled = useWatch<AccessControlFormData, 'mainRule.enabled'>({
    name: 'mainRule.enabled',
  });

  const blockAccess = useWatch<AccessControlFormData, 'mainRule.blockAccess'>({
    name: 'mainRule.blockAccess',
  });

  const releaseDate = useWatchOverridableField<string>('mainRule', 'dateControl.releaseDate');

  const prairieTestExams = useWatch<
    AccessControlFormData,
    'mainRule.integrations.prairieTest.exams'
  >({
    name: 'mainRule.integrations.prairieTest.exams',
    defaultValue: [],
  });

  const hasDateRelease = releaseDate?.isEnabled ?? false;

  const hasPrairieTestRelease = (prairieTestExams?.length ?? 0) > 0;

  return (
    <div>
      {ruleEnabled && (
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            id="mainRule-block-access"
            label="Block access"
            {...register('mainRule.blockAccess')}
            aria-describedby="mainRule-block-access-help"
          />
          <Form.Text id="mainRule-block-access-help" className="text-muted">
            Deny access if this rule applies
          </Form.Text>
        </Form.Group>
      )}

      {ruleEnabled && !blockAccess && (
        <>
          {(hasDateRelease || hasPrairieTestRelease) && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="mainRule-list-before-release"
                label="List before release"
                {...register('mainRule.listBeforeRelease')}
                aria-describedby="mainRule-list-before-release-help"
              />
              <Form.Text id="mainRule-list-before-release-help" className="text-muted">
                Students can see the title and click into assessment before release
              </Form.Text>
            </Form.Group>
          )}

          <DateControlForm />
          <IntegrationsSection />

          <AfterCompleteForm namePrefix="mainRule" />
        </>
      )}
    </div>
  );
}
