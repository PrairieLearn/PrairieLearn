import { Dropdown } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

export function IntegrationsSection() {
  const { setValue } = useFormContext<AccessControlFormData>();

  const prairieTestEnabled = useWatch<AccessControlFormData, 'mainRule.prairieTestEnabled'>({
    name: 'mainRule.prairieTestEnabled',
  });

  const availableIntegrations = [
    { key: 'prairieTest' as const, label: 'PrairieTest', added: prairieTestEnabled },
  ];
  const unadded = availableIntegrations.filter((i) => !i.added);

  const addIntegration = (key: string) => {
    if (key === 'prairieTest') {
      setValue('mainRule.prairieTestEnabled', true);
    }
  };

  const removeIntegration = (key: string) => {
    if (key === 'prairieTest') {
      setValue('mainRule.prairieTestEnabled', false);
      setValue('mainRule.prairieTestExams', []);
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
        <PrairieTestControlForm onRemove={() => removeIntegration('prairieTest')} />
      ) : (
        <p className="text-muted">No integrations configured.</p>
      )}
    </div>
  );
}
