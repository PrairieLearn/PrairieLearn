import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { ZoneAssessmentForm } from '../../types.js';

export function DragPreview({
  activeDragId,
  zones,
  questionMetadata,
}: {
  activeDragId: string;
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, StaffAssessmentQuestionRow>>;
}) {
  for (const [zoneIndex, zone] of zones.entries()) {
    if (zone.trackingId === activeDragId) {
      return (
        <div className="bg-body-secondary border rounded shadow-sm px-3 py-2 fw-semibold">
          {zone.title || `Zone ${zoneIndex + 1}`}
        </div>
      );
    }
    for (const question of zone.questions) {
      if (question.trackingId === activeDragId) {
        const qData = question.id ? questionMetadata[question.id] : null;
        return (
          <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
            {qData?.question.title ?? question.id ?? 'Alternative group'}
          </div>
        );
      }
      for (const alt of question.alternatives ?? []) {
        if (alt.trackingId === activeDragId) {
          const altData = alt.id ? questionMetadata[alt.id] : null;
          return (
            <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
              {altData?.question.title ?? alt.id}
            </div>
          );
        }
      }
    }
  }
  return null;
}
