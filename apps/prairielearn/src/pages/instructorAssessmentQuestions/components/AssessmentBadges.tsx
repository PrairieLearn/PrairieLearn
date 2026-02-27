import { OverlayTrigger } from '@prairielearn/ui';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import type { AssessmentForPicker } from '../types.js';

function toBadgeProps(assessment: AssessmentForPicker, useSetColor = true) {
  return {
    assessment_id: assessment.assessment_id,
    color: useSetColor ? (assessment.assessment_set_color ?? assessment.color) : assessment.color,
    label: assessment.label,
  };
}

/**
 * Groups assessments by their set abbreviation and returns them sorted.
 * Returns null if abbreviation data is not available.
 */
function groupByAbbreviation(
  assessments: AssessmentForPicker[],
): Map<string, AssessmentForPicker[]> | null {
  if (!assessments.every((a) => a.assessment_set_abbreviation && a.assessment_number)) {
    return null;
  }

  const grouped = new Map<string, AssessmentForPicker[]>();

  for (const assessment of assessments) {
    const abbrev = assessment.assessment_set_abbreviation!;
    const existing = grouped.get(abbrev) ?? [];
    existing.push(assessment);
    grouped.set(abbrev, existing);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  for (const items of grouped.values()) {
    items.sort((a, b) => collator.compare(a.assessment_number!, b.assessment_number!));
  }

  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Renders assessment badges with grouping for compact display.
 * Groups of 3+ assessments with the same abbreviation are collapsed.
 */
export function AssessmentBadges({
  assessments,
  urlPrefix,
}: {
  assessments: AssessmentForPicker[];
  urlPrefix: string;
}) {
  if (assessments.length === 0) {
    return null;
  }

  const grouped = groupByAbbreviation(assessments);

  if (!grouped) {
    return (
      <>
        {assessments.slice(0, 3).map((assessment) => (
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            <AssessmentBadge urlPrefix={urlPrefix} assessment={toBadgeProps(assessment, false)} />
          </span>
        ))}
        {assessments.length > 3 && (
          <span className="badge bg-secondary">+{assessments.length - 3}</span>
        )}
      </>
    );
  }

  const elements: React.ReactNode[] = [];

  for (const [abbrev, items] of grouped) {
    if (items.length < 3) {
      for (const assessment of items) {
        elements.push(
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            <AssessmentBadge urlPrefix={urlPrefix} assessment={toBadgeProps(assessment)} />
          </span>,
        );
      }
    } else {
      const color = items[0].assessment_set_color ?? items[0].color;
      const name = items[0].assessment_set_name ?? abbrev;
      elements.push(
        <span key={`group-${abbrev}`} className="d-inline-block me-1">
          <OverlayTrigger
            trigger="click"
            placement="auto"
            popover={{
              props: { id: `picker-assessments-popover-${abbrev}` },
              header: `${name} (${items.length})`,
              body: (
                <div className="d-flex flex-wrap gap-1">
                  {items.map((assessment) => (
                    <AssessmentBadge
                      key={assessment.assessment_id}
                      urlPrefix={urlPrefix}
                      assessment={toBadgeProps(assessment)}
                    />
                  ))}
                </div>
              ),
            }}
            rootClose
          >
            <button
              type="button"
              className={`btn btn-badge color-${color}`}
              aria-label={`${abbrev}: ${items.length} assessments`}
              onClick={(e) => e.stopPropagation()}
            >
              {abbrev} ×{items.length}
            </button>
          </OverlayTrigger>
        </span>,
      );
    }
  }

  return <>{elements}</>;
}
