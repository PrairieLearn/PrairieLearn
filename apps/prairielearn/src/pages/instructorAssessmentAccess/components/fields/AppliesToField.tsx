import { useMemo } from 'react';
import { Badge, Button, Card, CloseButton, Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';

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
            label="Student groups"
            checked={currentTargetType === 'group'}
            onChange={() => handleTargetTypeChange('group')}
          />
        </div>

        {/* Selected items display */}
        <div className="d-flex flex-wrap align-items-center gap-1">
          {currentTargetType === 'individual' ? (
            <>
              {individuals.length === 0 ? (
                <span className="text-muted small">No students selected</span>
              ) : (
                individuals.map((student, index) => (
                  <Badge
                    key={individualFields[index]?.id ?? student.uid}
                    bg="secondary"
                    className="d-inline-flex align-items-center py-1 px-2"
                  >
                    <span className="me-1">{student.name ?? student.uid}</span>
                    <CloseButton
                      aria-label={`Remove ${student.name ?? student.uid}`}
                      style={{ fontSize: '0.5rem' }}
                      variant="white"
                      onClick={() => removeIndividual(index)}
                    />
                  </Badge>
                ))
              )}
            </>
          ) : (
            <>
              {groups.length === 0 ? (
                <span className="text-muted small">No groups selected</span>
              ) : (
                groups.map((group, index) => (
                  <Badge
                    key={groupFields[index]?.id ?? group.groupId}
                    bg="secondary"
                    className="d-inline-flex align-items-center py-1 px-2"
                  >
                    <span className="me-1">{group.name}</span>
                    <CloseButton
                      aria-label={`Remove ${group.name}`}
                      style={{ fontSize: '0.5rem' }}
                      variant="white"
                      onClick={() => removeGroup(index)}
                    />
                  </Badge>
                ))
              )}
            </>
          )}

          {/* Add button with popover */}
          <AddTargetPopover
            targetType={currentTargetType}
            urlPrefix={urlPrefix}
            assessmentId={assessmentId}
            excludedGroupIds={excludedGroupIds}
            excludedUids={excludedUids}
            onSelectGroups={handleAddGroups}
            onSelectStudents={handleAddStudents}
          />

          {/* Remove all button */}
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
