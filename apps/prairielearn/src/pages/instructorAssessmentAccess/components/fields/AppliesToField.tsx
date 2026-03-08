import { Button, Card, Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useFieldArray, useWatch } from 'react-hook-form';

import { ChipGroup } from '@prairielearn/ui';

import type {
  AccessControlFormData,
  AppliesTo,
  IndividualTarget,
  StudentLabelTarget,
  TargetType,
} from '../types.js';

import { AddTargetPopover } from './AddTargetPopover.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface AppliesToFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

export function AppliesToField({ control, setValue, namePrefix }: AppliesToFieldProps) {
  const appliesTo = useWatch({
    control,
    name: `${namePrefix}.appliesTo` as const,
  });

  const { append: appendIndividual, remove: removeIndividual } = useFieldArray({
    control,
    name: `${namePrefix}.appliesTo.individuals` as 'mainRule.appliesTo.individuals',
  });

  const { append: appendStudentLabel, remove: removeStudentLabel } = useFieldArray({
    control,
    name: `${namePrefix}.appliesTo.studentLabels` as 'mainRule.appliesTo.studentLabels',
  });

  const handleTargetTypeChange = (newType: TargetType) => {
    setValue(
      `${namePrefix}.appliesTo` as const,
      {
        targetType: newType,
        individuals: [],
        studentLabels: [],
      },
      { shouldDirty: true },
    );
  };

  const handleAddStudentLabels = (labels: StudentLabelTarget[]) => {
    for (const label of labels) {
      appendStudentLabel(label);
    }
  };

  const handleAddStudents = (students: IndividualTarget[]) => {
    for (const student of students) {
      appendIndividual(student);
    }
  };

  const handleRemoveAllIndividuals = () => {
    removeIndividual();
  };

  const handleRemoveAllStudentLabels = () => {
    removeStudentLabel();
  };

  // appliesTo may be undefined during initial render
  const typedAppliesTo = appliesTo as AppliesTo | undefined;
  const currentTargetType = typedAppliesTo?.targetType ?? 'individual';
  const individuals = typedAppliesTo?.individuals ?? [];
  const studentLabels = typedAppliesTo?.studentLabels ?? [];

  const individualChipItems = individuals.map((s) => ({ id: s.uid, label: s.name ?? s.uid }));
  const studentLabelChipItems = studentLabels.map((sl) => ({
    id: sl.studentLabelId,
    label: sl.name,
  }));

  const handleRemoveIndividualByUid = (uid: string) => {
    const index = individuals.findIndex((s) => s.uid === uid);
    if (index !== -1) removeIndividual(index);
  };
  const handleRemoveStudentLabelById = (studentLabelId: string) => {
    const index = studentLabels.findIndex((sl) => sl.studentLabelId === studentLabelId);
    if (index !== -1) removeStudentLabel(index);
  };

  const excludedStudentLabelIds = new Set(studentLabels.map((sl) => sl.studentLabelId));
  const excludedUids = new Set(individuals.map((i) => i.uid));

  return (
    <Card className="mb-3">
      <Card.Header>
        <strong>Applies to</strong>
      </Card.Header>
      <Card.Body>
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
            id={`${namePrefix}-target-student-label`}
            name={`${namePrefix}-target-type`}
            label="Student labels"
            checked={currentTargetType === 'student_label'}
            onChange={() => handleTargetTypeChange('student_label')}
          />
        </div>

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
              items={studentLabelChipItems}
              label="Selected student labels"
              emptyMessage="No student labels selected"
              onRemove={handleRemoveStudentLabelById}
            />
          )}

          <AddTargetPopover
            targetType={currentTargetType}
            excludedStudentLabelIds={excludedStudentLabelIds}
            excludedUids={excludedUids}
            onSelectStudentLabels={handleAddStudentLabels}
            onSelectStudents={handleAddStudents}
          />

          {currentTargetType === 'individual' && individuals.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={handleRemoveAllIndividuals}>
              Remove all
            </Button>
          )}
          {currentTargetType === 'student_label' && studentLabels.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={handleRemoveAllStudentLabels}>
              Remove all
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
