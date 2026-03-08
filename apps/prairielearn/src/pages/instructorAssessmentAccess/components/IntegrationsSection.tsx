import { Dropdown } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

interface IntegrationsSectionProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
}

export function IntegrationsSection({ control, setValue }: IntegrationsSectionProps) {
  const prairieTestEnabled = useWatch({
    control,
    name: 'mainRule.integrations.prairieTest.enabled',
  });

  const availableIntegrations = [
    { key: 'prairieTest' as const, label: 'PrairieTest', added: prairieTestEnabled },
  ];
  const unadded = availableIntegrations.filter((i) => !i.added);

  const addIntegration = (key: string) => {
    if (key === 'prairieTest') {
      setValue('mainRule.integrations.prairieTest.enabled', true);
    }
  };

  const removeIntegration = (key: string) => {
    if (key === 'prairieTest') {
      setValue('mainRule.integrations.prairieTest.enabled', false);
      setValue('mainRule.integrations.prairieTest.exams', []);
    }
  };

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Integrations</h6>
        {unadded.length > 0 && (
          <Dropdown>
            <Dropdown.Toggle size="sm" variant="outline-primary">
              <i className="bi bi-plus-circle me-1" aria-hidden="true" /> Add integration
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {unadded.map((i) => (
                <Dropdown.Item key={i.key} onClick={() => addIntegration(i.key)}>
                  {i.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>

      {prairieTestEnabled ? (
        <PrairieTestControlForm
          control={control}
          namePrefix="mainRule"
          setValue={setValue}
          onRemove={() => removeIntegration('prairieTest')}
        />
      ) : (
        <p className="text-muted">No integrations configured.</p>
      )}
    </div>
  );
}
