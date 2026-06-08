import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';

import type { AssessmentForModule } from '../../../models/assessment-module.js';
import type { AssessmentModuleFormRow } from '../instructorCourseAdminModules.types.js';

export type AssessmentModuleUsageModalData = AssessmentModuleFormRow;

interface AssessmentModuleUsageModalProps {
  show: boolean;
  data: AssessmentModuleUsageModalData | null;
  onHide: () => void;
  onExited: () => void;
}

export function AssessmentModuleUsageModal({
  show,
  data,
  onHide,
  onExited,
}: AssessmentModuleUsageModalProps) {
  // Group assessments by course instance
  const groupedAssessments = useMemo(() => {
    if (!data) return [];

    const groups = new Map<string, AssessmentForModule[]>();
    for (const assessment of data.assessments) {
      const key = assessment.course_instance_id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(assessment);
    }

    // Convert to array (already sorted by publishing dates DESC from SQL)
    return Array.from(groups.entries());
  }, [data]);

  return (
    <Modal show={show} size="lg" onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Assessments in "{data?.name}"</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {data?.assessments.length === 0 ? (
          <p className="text-muted mb-0">No assessments use this module.</p>
        ) : (
          <div className="d-flex flex-column gap-3">
            {groupedAssessments.map(([courseInstanceId, assessments]) => (
              <div key={courseInstanceId}>
                <div className="fw-bold">
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
                    className="d-flex align-items-center gap-2 py-1 rounded"
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

AssessmentModuleUsageModal.displayName = 'AssessmentModuleUsageModal';
