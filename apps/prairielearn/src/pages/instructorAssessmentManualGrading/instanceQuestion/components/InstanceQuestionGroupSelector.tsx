import { useMutation } from '@tanstack/react-query';
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
  const updateGroupMutation = useMutation({
    // TODO: Replace this legacy REST endpoint with an assessment-question tRPC mutation once the
    // grading panel shares the page's tRPC client.
    mutationFn: async (selectedGroupId: string | null) => {
      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualInstanceQuestionGroupId: selectedGroupId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    onSuccess: (_, selectedGroupId) => onChange(selectedGroupId),
  });

  return (
    <li className="list-group-item">
      <Form.Label id="instance-question-group-label" htmlFor="instance-question-group-toggle">
        Submission group
      </Form.Label>
      <RichSelect
        id="instance-question-group-toggle"
        aria-labelledby="instance-question-group-label"
        disabled={disabled || updateGroupMutation.isPending}
        errorMessage={
          updateGroupMutation.isError ? 'Failed to update the submission group.' : undefined
        }
        items={[
          ...groups.map<RichSelectItem>((group) => ({
            value: group.id,
            label: group.name,
            description: group.description,
          })),
          { value: 'null', label: 'No group', description: 'No group assigned.' },
        ]}
        value={selectedGroupId ?? 'null'}
        onChange={(selected) => updateGroupMutation.mutate(selected === 'null' ? null : selected)}
      />
    </li>
  );
}
