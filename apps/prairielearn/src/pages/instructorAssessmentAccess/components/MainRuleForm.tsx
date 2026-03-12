import { Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';

import { MainAfterCompleteForm } from './AfterCompleteForm.js';
import { MainDateControlForm } from './DateControlForm.js';
import { IntegrationsSection } from './IntegrationsSection.js';
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

  const releaseDate = useWatch<AccessControlFormData, 'mainRule.releaseDate'>({
    name: 'mainRule.releaseDate',
  });

  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
    defaultValue: [],
  });

  const hasDateRelease = releaseDate !== null;

  const hasPrairieTestRelease = prairieTestExams.length > 0;

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

          <MainDateControlForm />
          <IntegrationsSection />

          <MainAfterCompleteForm />
        </>
      )}
    </div>
  );
}
