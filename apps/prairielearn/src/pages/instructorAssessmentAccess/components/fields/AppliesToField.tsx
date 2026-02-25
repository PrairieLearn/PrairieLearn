import { useMemo } from 'react';
import { Button, Card, Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';

import { ChipGroup } from '@prairielearn/ui';

import type {
  AccessControlFormData,
  AppliesTo,
  GroupTarget,
  IndividualTarget,
  TargetType,
} from '../types.js';

import { AddTargetPopover } from './AddTargetPopover.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface AppliesToFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
  urlPrefix: string;
  assessmentId: string;
}

export function AppliesToField({
  control,
  setValue,
  namePrefix,
  urlPrefix,
  assessmentId,
}: AppliesToFieldProps) {
  // Watch the current appliesTo value
  const appliesTo = useWatch({
    control,
    name: `${namePrefix}.appliesTo` as const,
  });

  // Field arrays for managing individuals and groups
  const {
    fields: individualFields,
    append: appendIndividual,
    remove: removeIndividual,
  } = useFieldArray({
    control,
    name: `${namePrefix}.appliesTo.individuals` as 'mainRule.appliesTo.individuals',
  });

  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
  } = useFieldArray({
    control,
    name: `${namePrefix}.appliesTo.groups` as 'mainRule.appliesTo.groups',
  });

  // Handle target type change
  const handleTargetTypeChange = (newType: TargetType) => {
    // Clear selections when switching modes
    setValue(
      `${namePrefix}.appliesTo` as const,
      {
        targetType: newType,
        individuals: [],
        groups: [],
      },
      { shouldDirty: true },
    );
  };

  // Handle adding groups
  const handleAddGroups = (groups: GroupTarget[]) => {
    for (const group of groups) {
      appendGroup(group);
    }
  };

  // Handle adding students
  const handleAddStudents = (students: IndividualTarget[]) => {
    for (const student of students) {
      appendIndividual(student);
    }
  };

  // Handle removing all individuals
  const handleRemoveAllIndividuals = () => {
    // Remove all items by index, starting from the end
    for (let i = individualFields.length - 1; i >= 0; i--) {
      removeIndividual(i);
    }
  };

  // Handle removing all groups
  const handleRemoveAllGroups = () => {
    // Remove all items by index, starting from the end
    for (let i = groupFields.length - 1; i >= 0; i--) {
      removeGroup(i);
    }
  };

  // Get values with safe defaults - appliesTo may be undefined during initial render
  const typedAppliesTo = appliesTo as AppliesTo | undefined;
  const currentTargetType = typedAppliesTo?.targetType ?? 'individual';
  const individuals = useMemo(() => typedAppliesTo?.individuals ?? [], [typedAppliesTo]);
  const groups = useMemo(() => typedAppliesTo?.groups ?? [], [typedAppliesTo]);

  // Map data to ChipGroup items
  const individualChipItems = useMemo(
    () => individuals.map((s) => ({ id: s.uid, label: s.name ?? s.uid })),
    [individuals],
  );
  const groupChipItems = useMemo(
    () => groups.map((g) => ({ id: g.groupId, label: g.name })),
    [groups],
  );

  // Remove by id (used by ChipGroup's onRemove which provides the item id)
  const handleRemoveIndividualByUid = (uid: string) => {
    const index = individuals.findIndex((s) => s.uid === uid);
    if (index !== -1) removeIndividual(index);
  };
  const handleRemoveGroupById = (groupId: string) => {
    const index = groups.findIndex((g) => g.groupId === groupId);
    if (index !== -1) removeGroup(index);
  };

  // Create sets for excluded IDs
  const excludedGroupIds = useMemo(() => new Set(groups.map((g) => g.groupId)), [groups]);

  const excludedUids = useMemo(() => new Set(individuals.map((i) => i.uid)), [individuals]);

  return (
    <Card className="mb-3">
      <Card.Header>
        <strong>Applies to</strong>
      </Card.Header>
      <Card.Body>
        {/* Radio buttons for target type */}
        <div className="mb-3">
          <Form.Check
            type="radio"
            id={`${namePrefix}-target-individual`}
            name={`${namePrefix}-target-type`}
            label="Individual students"
            checked={currentTargetType === 'individual'}
            onChange={() => handleTargetTypeChange('individual')}
          />
          <Form.Check
            type="radio"
            id={`${namePrefix}-target-group`}
            name={`${namePrefix}-target-type`}
            label="Student labels"
            checked={currentTargetType === 'group'}
            onChange={() => handleTargetTypeChange('group')}
          />
        </div>

        {/* Selected items display */}
        <div className="d-flex flex-wrap align-items-center gap-1">
          {currentTargetType === 'individual' ? (
            <ChipGroup
              items={individualChipItems}
              label="Selected students"
              emptyMessage="No students selected"
              onRemove={handleRemoveIndividualByUid}
            />
          ) : (
            <ChipGroup
              items={groupChipItems}
              label="Selected groups"
              emptyMessage="No groups selected"
              onRemove={handleRemoveGroupById}
            />
          )}

          <AddTargetPopover
            targetType={currentTargetType}
            urlPrefix={urlPrefix}
            assessmentId={assessmentId}
            excludedGroupIds={excludedGroupIds}
            excludedUids={excludedUids}
            onSelectGroups={handleAddGroups}
            onSelectStudents={handleAddStudents}
          />

          {currentTargetType === 'individual' && individuals.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={handleRemoveAllIndividuals}>
              Remove all
            </Button>
          )}
          {currentTargetType === 'group' && groups.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={handleRemoveAllGroups}>
              Remove all
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
