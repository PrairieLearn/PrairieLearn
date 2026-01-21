import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';

import type {
  AssessmentForSet,
  InstructorCourseAdminSetRow,
} from '../instructorCourseAdminSets.shared.js';

interface AssessmentSetUsageModalProps {
  assessmentSet: InstructorCourseAdminSetRow | null;
  onHide: () => void;
}

export function AssessmentSetUsageModal({ assessmentSet, onHide }: AssessmentSetUsageModalProps) {
  // Group assessments by course instance
  const groupedAssessments = useMemo(() => {
    if (!assessmentSet) return [];

    const groups = new Map<string, AssessmentForSet[]>();
    for (const assessment of assessmentSet.assessments) {
      const key = assessment.course_instance_id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(assessment);
    }

    // Convert to array (already sorted by ci.id DESC from SQL)
    return Array.from(groups.entries());
  }, [assessmentSet]);

  return (
    <Modal show={assessmentSet !== null} size="lg" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Assessments using "{assessmentSet?.name}"</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {assessmentSet?.assessments.length === 0 ? (
          <p className="text-muted mb-0">No assessments use this assessment set.</p>
        ) : (
          <div className="d-flex flex-column">
            {groupedAssessments.map(([courseInstanceId, assessments], groupIndex) => (
              <div key={courseInstanceId}>
                <div className={`fw-bold ${groupIndex === 0 ? 'mt-0' : 'mt-3'}`}>
                  {assessments[0].course_instance_long_name || 'Unnamed instance'}
                  {assessments[0].course_instance_short_name && (
                    <span className="text-muted ms-1">
                      ({assessments[0].course_instance_short_name})
                    </span>
                  )}
                </div>
                {assessments.map((assessment) => (
                  <div
                    key={assessment.assessment_id}
                    className="d-flex align-items-center gap-2 p-2 rounded"
                  >
                    <span className={`badge color-${assessment.color}`}>{assessment.label}</span>
                    <a
                      href={`/pl/course_instance/${assessment.course_instance_id}/instructor/assessment/${assessment.assessment_id}/`}
                    >
                      {assessment.title}
                    </a>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}

AssessmentSetUsageModal.displayName = 'AssessmentSetUsageModal';
