import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
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
import { getStudentEnrollmentUrl } from '../../../../lib/client/url.js';
import { useTRPC } from '../../../../trpc/assessment/context.js';
import type { NamePrefix } from '../hooks/fieldNames.js';
import type { AccessControlFormData, AppliesTo, EnrollmentTarget, TargetType } from '../types.js';

import { AddStudentsModal } from './AddStudentsModal.js';

export function AppliesToField({
  namePrefix,
  courseInstanceId,
}: {
  namePrefix: NamePrefix;
  courseInstanceId: string;
}) {
  const { setValue } = useFormContext<AccessControlFormData>();
  const trpc = useTRPC();

  const { data: allLabels } = useQuery(trpc.accessControl.studentLabels.queryOptions());

  const appliesTo = useWatch({
    name: `${namePrefix}.appliesTo` as Path<AccessControlFormData>,
  });

  const { replace: replaceEnrollments, remove: removeEnrollment } = useFieldArray({
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

  const handleSaveStudents = (students: EnrollmentTarget[]) => {
    replaceEnrollments(students);
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
    <div className="mb-3">
      <div className="section-header mb-3">
        <strong>Applies to</strong>
      </div>
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
          <div className="border rounded overflow-hidden">
            <div
              className={clsx(
                'd-flex align-items-center px-3 py-2 bg-body-tertiary',
                enrollments.length > 0 && 'border-bottom',
              )}
            >
              <span className="small text-muted">
                {enrollments.length} {enrollments.length === 1 ? 'student' : 'students'}
              </span>
              <div className="ms-auto">
                <AddStudentsModal
                  selectedUids={excludedUids}
                  renderTrigger={({ onClick }) => (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-decoration-none"
                      onClick={onClick}
                    >
                      Select students…
                    </Button>
                  )}
                  onSaveStudents={handleSaveStudents}
                />
              </div>
            </div>
            {enrollments.length > 0 && (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <ListGroup variant="flush">
                  {enrollments.map((s) => (
                    <ListGroup.Item
                      key={s.uid}
                      className="d-flex align-items-center justify-content-between py-2"
                    >
                      <div className="d-flex flex-column">
                        <a href={getStudentEnrollmentUrl(courseInstanceId, s.enrollmentId)}>
                          {s.uid}
                        </a>
                        {s.name && <span className="text-muted small">{s.name}</span>}
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
              </div>
            )}
          </div>
        ) : (
          <div className="d-flex flex-wrap align-items-baseline gap-2">
            <StudentLabelDropdown
              labels={allLabels ?? []}
              selectedIds={excludedStudentLabelIds}
              buttonLabel="Select labels"
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
          </div>
        )}
      </div>
      {hasNoTargets && (
        <Alert variant="warning" className="mt-3 mb-0">
          This override has no targets. Add at least one{' '}
          {currentTargetType === 'enrollment' ? 'student' : 'student label'} for this rule to take
          effect.
        </Alert>
      )}
    </div>
  );
}
