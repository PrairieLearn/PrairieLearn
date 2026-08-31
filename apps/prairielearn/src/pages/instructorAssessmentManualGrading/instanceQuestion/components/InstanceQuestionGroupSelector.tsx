import { useState } from 'react';
import Form from 'react-bootstrap/Form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import type { InstanceQuestionGradingPanelProps } from './InstanceQuestionGradingPanel.types.js';

export function InstanceQuestionGroupSelector({
  disabled,
  groups,
  selectedGroupId,
  updateUrl,
  onChange,
}: {
  disabled: boolean;
  groups: InstanceQuestionGradingPanelProps['instanceQuestionGroups'];
  selectedGroupId: string | null;
  updateUrl: string;
  onChange: (selectedGroupId: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const updateGroup = async (selectedGroupId: string | null) => {
    setUpdating(true);
    setError(null);
    try {
      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualInstanceQuestionGroupId: selectedGroupId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onChange(selectedGroupId);
    } catch {
      setError('Failed to update the submission group.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <li className="list-group-item">
      <Form.Label id="instance-question-group-label" htmlFor="instance-question-group-toggle">
        Submission group
      </Form.Label>
      <RichSelect
        id="instance-question-group-toggle"
        aria-labelledby="instance-question-group-label"
        disabled={disabled || updating}
        errorMessage={error ?? undefined}
        items={[
          ...groups.map<RichSelectItem>((group) => ({
            value: group.id,
            label: group.name,
            description: group.description,
          })),
          { value: 'null', label: 'No group', description: 'No group assigned.' },
        ]}
        value={selectedGroupId ?? 'null'}
        onChange={(selected) => void updateGroup(selected === 'null' ? null : selected)}
      />
    </li>
  );
}
