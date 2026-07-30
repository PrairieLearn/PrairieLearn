import type { EditorQuestionMetadata } from '../../../../lib/assessment-question.shared.js';
import type { ZoneAssessmentForm } from '../../types.js';
import { questionHasTitle } from '../../utils/questions.js';

export function DragPreview({
  activeDragId,
  zones,
  questionMetadata,
}: {
  activeDragId: string;
  zones: ZoneAssessmentForm[];
  questionMetadata: Partial<Record<string, EditorQuestionMetadata>>;
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
        const qData = (question.id ? questionMetadata[question.id] : null) ?? null;
        const hasTitle = questionHasTitle(qData);
        return (
          <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
            {hasTitle ? (
              qData!.question.title
            ) : (
              <span className="font-monospace">{question.id ?? 'Alternative pool'}</span>
            )}
          </div>
        );
      }
      for (const alt of question.alternatives ?? []) {
        if (alt.trackingId === activeDragId) {
          const altData = questionMetadata[alt.id] ?? null;
          const hasTitle = questionHasTitle(altData);
          return (
            <div className="bg-body border rounded shadow-sm px-3 py-2 text-truncate">
              {hasTitle ? (
                altData!.question.title
              ) : (
                <span className="font-monospace">{alt.id}</span>
              )}
            </div>
          );
        }
      }
    }
  }
  return null;
}
