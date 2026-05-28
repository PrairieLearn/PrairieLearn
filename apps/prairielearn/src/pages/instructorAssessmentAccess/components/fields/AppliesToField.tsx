import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Alert, Button, Form, ListGroup } from 'react-bootstrap';
import { useFieldArray, useWatch } from 'react-hook-form';

import { StudentLabelBadge } from '../../../../components/StudentLabelBadge.js';
import { StudentLabelDropdown } from '../../../../components/StudentLabelDropdown.js';
import { getStudentEnrollmentUrl } from '../../../../lib/client/url.js';
import { useTRPC } from '../../../../trpc/assessment/context.js';
import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
import type { AccessControlFormData, EnrollmentTarget, TargetType } from '../types.js';

import { AddStudentsModal } from './AddStudentsModal.js';

export function AppliesToField({
  namePrefix,
  courseInstanceId,
  canEditAccessSettings,
  canEditEnrollmentRules,
  onTargetTypeChange,
}: {
  namePrefix: `overrides.${number}`;
  courseInstanceId: string;
  /** Whether the user has page-level permission to edit access settings at all. */
  canEditAccessSettings: boolean;
  /** Whether the user has permission to edit enrollment-targeted rules. */
  canEditEnrollmentRules: boolean;
  onTargetTypeChange: (targetType: TargetType) => void;
}) {
  const trpc = useTRPC();
  const ruleEditable = useAccessControlRuleEditable();
  const showStudentLabelOnlyHint = canEditAccessSettings && !canEditEnrollmentRules;

  const { targetType, enrollments, studentLabels } = useWatch<
    AccessControlFormData,
    `overrides.${number}.appliesTo`
  >({
    name: `${namePrefix}.appliesTo`,
  });

  const { data: allLabels } = useQuery({
    ...trpc.accessControl.studentLabels.queryOptions(),
    enabled: ruleEditable && targetType === 'student_label',
  });

  const { replace: replaceEnrollments, remove: removeEnrollment } = useFieldArray({
    name: `${namePrefix}.appliesTo.enrollments`,
  });

  const { append: appendStudentLabel, remove: removeStudentLabel } = useFieldArray({
    name: `${namePrefix}.appliesTo.studentLabels`,
  });

  const handleSaveStudents = (students: EnrollmentTarget[]) => {
    replaceEnrollments(students);
  };

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
  const targetDescription = targetType === 'enrollment' ? 'student' : 'student label';
  const studentSpecificPermissionMessageId = `${namePrefix}-student-specific-permission-message`;

  return (
    <div className="mb-3">
      <div className="section-header mb-3">
        <strong>Applies to</strong>
      </div>
      {showStudentLabelOnlyHint && (
        <Alert variant="info" className="mb-3" id={studentSpecificPermissionMessageId}>
          Student-specific overrides require student data editor permissions. You can still create
          or edit overrides for students with specific labels.
        </Alert>
      )}
      <fieldset className="mb-3">
        <legend className="visually-hidden">Target type</legend>
        <Form.Check
          type="radio"
          id={`${namePrefix}-target-enrollment`}
          name={`${namePrefix}-target-type`}
          label="Specific students"
          checked={targetType === 'enrollment'}
          disabled={!ruleEditable || !canEditEnrollmentRules}
          aria-describedby={
            showStudentLabelOnlyHint ? studentSpecificPermissionMessageId : undefined
          }
          onChange={() => onTargetTypeChange('enrollment')}
        />
        <Form.Check
          type="radio"
          id={`${namePrefix}-target-student-label`}
          name={`${namePrefix}-target-type`}
          label="Students by label"
          checked={targetType === 'student_label'}
          disabled={!ruleEditable}
          onChange={() => onTargetTypeChange('student_label')}
        />
      </fieldset>

      <div>
        {targetType === 'enrollment' ? (
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
              {ruleEditable && (
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
              )}
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
                      {ruleEditable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${s.name ?? s.uid}`}
                          onClick={() => handleRemoveEnrollmentByUid(s.uid)}
                        >
                          <i className="bi bi-trash text-danger" aria-hidden="true" />
                        </Button>
                      )}
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="d-flex flex-wrap align-items-baseline gap-2">
              {ruleEditable && (
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
              )}
              {studentLabels.length === 0 ? (
                <span className="text-muted small">No student labels selected</span>
              ) : (
                studentLabels.map((sl) => (
                  <StudentLabelBadge
                    key={sl.studentLabelId}
                    label={{ name: sl.name, color: sl.color ?? 'gray1' }}
                  >
                    {ruleEditable && (
                      <button
                        type="button"
                        className="btn p-0 lh-1"
                        aria-label={`Remove label "${sl.name}"`}
                        onClick={() => handleRemoveStudentLabelById(sl.studentLabelId)}
                      >
                        <i className="bi bi-x text-danger" aria-hidden="true" />
                      </button>
                    )}
                  </StudentLabelBadge>
                ))
              )}
            </div>
            <div className="form-text mt-2">
              Applies to students with any of the selected labels.
            </div>
          </div>
        )}
      </div>
      {hasNoTargets && (
        <Alert variant="warning" className="mt-3 mb-0">
          This override has no targets.{' '}
          {ruleEditable
            ? `Add at least one ${targetDescription} for this rule to take effect.`
            : `A user with permission to edit this override must add at least one ${targetDescription} for this rule to take effect.`}
        </Alert>
      )}
    </div>
  );
}
