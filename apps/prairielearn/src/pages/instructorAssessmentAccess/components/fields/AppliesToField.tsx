import { Button, Card, Form } from 'react-bootstrap';
import {
  type FieldArrayPath,
  type Path,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';

import { ChipGroup } from '@prairielearn/ui';

import type { NamePrefix } from '../hooks/fieldNames.js';
import type {
  AccessControlFormData,
  AppliesTo,
  EnrollmentTarget,
  StudentLabelTarget,
  TargetType,
} from '../types.js';

import { AddTargetPopover } from './AddTargetPopover.js';

export function AppliesToField({ namePrefix }: { namePrefix: NamePrefix }) {
  const { setValue } = useFormContext<AccessControlFormData>();

  const appliesTo = useWatch({
    name: `${namePrefix}.appliesTo` as Path<AccessControlFormData>,
  });

  const { append: appendEnrollment, remove: removeEnrollment } = useFieldArray({
    name: `${namePrefix}.appliesTo.enrollments` as FieldArrayPath<AccessControlFormData>,
  });

  const { append: appendStudentLabel, remove: removeStudentLabel } = useFieldArray({
    name: `${namePrefix}.appliesTo.studentLabels` as FieldArrayPath<AccessControlFormData>,
  });

  const handleTargetTypeChange = (newType: TargetType) => {
    setValue(
      `${namePrefix}.appliesTo` as Path<AccessControlFormData>,
      {
        targetType: newType,
        enrollments: [],
        studentLabels: [],
      } as never,
      { shouldDirty: true },
    );
  };

  const handleAddStudentLabels = (labels: StudentLabelTarget[]) => {
    for (const label of labels) {
      appendStudentLabel(label);
    }
  };

  const handleAddStudents = (students: EnrollmentTarget[]) => {
    for (const student of students) {
      appendEnrollment(student);
    }
  };

  // appliesTo may be undefined during initial render
  const typedAppliesTo = appliesTo as AppliesTo | undefined;
  const currentTargetType = typedAppliesTo?.targetType ?? 'enrollment';
  const enrollments = typedAppliesTo?.enrollments ?? [];
  const studentLabels = typedAppliesTo?.studentLabels ?? [];

  const enrollmentChipItems = enrollments.map((s) => ({ id: s.uid, label: s.name ?? s.uid }));
  const studentLabelChipItems = studentLabels.map((sl) => ({
    id: sl.studentLabelId,
    label: sl.name,
  }));

  const handleRemoveEnrollmentByUid = (uid: string) => {
    const index = enrollments.findIndex((s) => s.uid === uid);
    if (index !== -1) removeEnrollment(index);
  };
  const handleRemoveStudentLabelById = (studentLabelId: string) => {
    const index = studentLabels.findIndex((sl) => sl.studentLabelId === studentLabelId);
    if (index !== -1) removeStudentLabel(index);
  };

  const excludedStudentLabelIds = new Set(studentLabels.map((sl) => sl.studentLabelId));
  const excludedUids = new Set(enrollments.map((i) => i.uid));

  return (
    <Card className="mb-3">
      <Card.Header>
        <strong>Applies to</strong>
      </Card.Header>
      <Card.Body>
        <fieldset className="mb-3">
          <legend className="visually-hidden">Target type</legend>
          <Form.Check
            type="radio"
            id={`${namePrefix}-target-enrollment`}
            name={`${namePrefix}-target-type`}
            label="Specific students"
            checked={currentTargetType === 'enrollment'}
            onChange={() => handleTargetTypeChange('enrollment')}
          />
          <Form.Check
            type="radio"
            id={`${namePrefix}-target-student-label`}
            name={`${namePrefix}-target-type`}
            label="Students by label"
            checked={currentTargetType === 'student_label'}
            onChange={() => handleTargetTypeChange('student_label')}
          />
        </fieldset>

        <div className="d-flex flex-wrap align-items-center gap-1">
          {currentTargetType === 'enrollment' ? (
            <ChipGroup
              items={enrollmentChipItems}
              label="Selected students"
              emptyMessage="No students selected"
              onRemove={handleRemoveEnrollmentByUid}
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

          {currentTargetType === 'enrollment' && enrollments.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={() => removeEnrollment()}>
              Remove all
            </Button>
          )}
          {currentTargetType === 'student_label' && studentLabels.length > 0 && (
            <Button variant="outline-secondary" size="sm" onClick={() => removeStudentLabel()}>
              Remove all
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
