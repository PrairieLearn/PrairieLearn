import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, ListGroup } from 'react-bootstrap';
import {
  type FieldArrayPath,
  type Path,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';

import { StudentLabelBadge } from '../../../../components/StudentLabelBadge.js';
import { StudentLabelDropdown } from '../../../../components/StudentLabelDropdown.js';
import { useTRPCClient } from '../../../../trpc/assessment/context.js';
import type { NamePrefix } from '../hooks/fieldNames.js';
import type { AccessControlFormData, AppliesTo, EnrollmentTarget, TargetType } from '../types.js';

import { AddStudentsModal } from './AddStudentsModal.js';

export function AppliesToField({ namePrefix }: { namePrefix: NamePrefix }) {
  const { setValue } = useFormContext<AccessControlFormData>();
  const trpcClient = useTRPCClient();

  const { data: allLabels } = useQuery({
    queryKey: ['access-control-student-labels'],
    queryFn: () => trpcClient.accessControl.studentLabels.query(),
  });

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

  const hasNoTargets = enrollments.length === 0 && studentLabels.length === 0;

  return (
    <div className="mb-4">
      <div className="section-header mb-3">
        <strong>Applies to</strong>
      </div>
      {hasNoTargets && (
        <Alert variant="warning">
          This override has no targets. Add at least one student or student label for this rule to
          take effect.
        </Alert>
      )}
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

      <div>
        {currentTargetType === 'enrollment' ? (
          <div>
            <div className="d-flex gap-2 mb-2">
              <AddStudentsModal excludedUids={excludedUids} onSelectStudents={handleAddStudents} />
              {enrollments.length > 0 && (
                <Button variant="outline-secondary" size="sm" onClick={() => removeEnrollment()}>
                  Remove all
                </Button>
              )}
            </div>
            {enrollments.length === 0 ? (
              <div className="text-muted small border rounded p-3 text-center">
                No students selected
              </div>
            ) : (
              <ListGroup style={{ maxHeight: '300px', overflow: 'auto' }}>
                {enrollments.map((s) => (
                  <ListGroup.Item
                    key={s.uid}
                    className="d-flex align-items-center justify-content-between py-2"
                  >
                    <div>
                      <div>{s.name ?? s.uid}</div>
                      {s.name && <small className="text-muted">{s.uid}</small>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${s.name ?? s.uid}`}
                      onClick={() => handleRemoveEnrollmentByUid(s.uid)}
                    >
                      <i className="bi bi-trash text-danger" aria-hidden="true" />
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </div>
        ) : (
          <div className="d-flex flex-wrap align-items-center gap-1">
            {studentLabels.length === 0 ? (
              <span className="text-muted small">No student labels selected</span>
            ) : (
              studentLabels.map((sl) => (
                <StudentLabelBadge
                  key={sl.studentLabelId}
                  label={{ name: sl.name, color: sl.color ?? 'gray1' }}
                >
                  <button
                    type="button"
                    className="btn p-0 lh-1"
                    aria-label={`Remove label "${sl.name}"`}
                    onClick={() => handleRemoveStudentLabelById(sl.studentLabelId)}
                  >
                    <i className="bi bi-x text-danger" aria-hidden="true" />
                  </button>
                </StudentLabelBadge>
              ))
            )}
            <StudentLabelDropdown
              labels={allLabels ?? []}
              selectedIds={excludedStudentLabelIds}
              onToggle={(label) => {
                if (excludedStudentLabelIds.has(label.id)) {
                  handleRemoveStudentLabelById(label.id);
                } else {
                  appendStudentLabel({
                    studentLabelId: label.id,
                    name: label.name,
                    color: label.color,
                  });
                }
              }}
            />
            {studentLabels.length > 0 && (
              <Button variant="outline-secondary" size="sm" onClick={() => removeStudentLabel()}>
                Remove all
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
