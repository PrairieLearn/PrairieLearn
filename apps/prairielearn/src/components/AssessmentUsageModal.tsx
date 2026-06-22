import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

/**
 * An assessment as shown in "View assessments" usage lists, with enough course
 * instance context to group it and link to it.
 */
export const AssessmentUsageSchema = z.object({
  assessment_id: IdSchema,
  tid: z.string(),
  title: z.string(),
  label: z.string(),
  color: z.string(),
  course_instance_id: IdSchema,
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
});
export type AssessmentUsage = z.infer<typeof AssessmentUsageSchema>;

/**
 * Lists the assessments that reference a course entity (e.g. an assessment set
 * or module), grouped by course instance.
 */
export function AssessmentUsageModal({
  show,
  data,
  entityLabel,
  onHide,
  onExited,
}: {
  show: boolean;
  data: { name: string; assessments: AssessmentUsage[] } | null;
  /** Describes the referenced entity, e.g. "assessment set" or "module". */
  entityLabel: string;
  onHide: () => void;
  onExited: () => void;
}) {
  // Group assessments by course instance (already sorted by publishing dates in SQL).
  const groupedAssessments = useMemo(() => {
    if (!data) return [];

    const groups = new Map<string, AssessmentUsage[]>();
    for (const assessment of data.assessments) {
      let group = groups.get(assessment.course_instance_id);
      if (!group) {
        group = [];
        groups.set(assessment.course_instance_id, group);
      }
      group.push(assessment);
    }

    return Array.from(groups.entries());
  }, [data]);

  return (
    <Modal show={show} size="lg" onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Assessments using "{data?.name}"</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {data?.assessments.length === 0 ? (
          <p className="text-muted mb-0">No assessments use this {entityLabel}.</p>
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

AssessmentUsageModal.displayName = 'AssessmentUsageModal';
