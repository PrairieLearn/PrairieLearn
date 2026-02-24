import { OverlayTrigger } from '@prairielearn/ui';

import type { OtherAssessment } from '../lib/assessment-question.shared.js';

import { AssessmentBadge } from './AssessmentBadge.js';

interface OtherAssessmentsBadgesProps {
  assessments: OtherAssessment[];
  urlPrefix: string;
}

/**
 * Groups assessments by their set abbreviation and returns them sorted alphabetically.
 */
function groupByAbbreviation(assessments: OtherAssessment[]): Map<string, OtherAssessment[]> {
  const grouped = new Map<string, OtherAssessment[]>();

  for (const assessment of assessments) {
    const abbrev = assessment.assessment_set_abbreviation;
    const existing = grouped.get(abbrev) ?? [];
    existing.push(assessment);
    grouped.set(abbrev, existing);
  }

  // Sort items within each group by assessment number
  for (const items of grouped.values()) {
    items.sort((a, b) => {
      const numA = Number.parseInt(a.assessment_number) || 0;
      const numB = Number.parseInt(b.assessment_number) || 0;
      return numA - numB;
    });
  }

  // Return sorted by abbreviation
  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Renders a compact view of other assessments that use a question.
 *
 * For assessment types with fewer than 3 assessments, individual badges are shown.
 * For types with 3+ assessments, a summary badge (e.g., "L ×20") is shown with a
 * popover containing all the individual badges.
 */
export function OtherAssessmentsBadges({ assessments, urlPrefix }: OtherAssessmentsBadgesProps) {
  if (assessments.length === 0) {
    return null;
  }

  const grouped = groupByAbbreviation(assessments);
  const elements: React.ReactNode[] = [];

  for (const [abbrev, items] of grouped) {
    if (items.length < 3) {
      // Render individual badges
      for (const assessment of items) {
        elements.push(
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            <AssessmentBadge
              urlPrefix={urlPrefix}
              assessment={{
                assessment_id: assessment.assessment_id,
                color: assessment.assessment_set_color,
                label: `${assessment.assessment_set_abbreviation}${assessment.assessment_number}`,
              }}
            />
          </span>,
        );
      }
    } else {
      // Render a grouped badge with popover
      const color = items[0].assessment_set_color;
      const name = items[0].assessment_set_name;
      elements.push(
        <span key={`group-${abbrev}`} className="d-inline-block me-1">
          <OverlayTrigger
            trigger="click"
            placement="auto"
            popover={{
              props: { id: `other-assessments-popover-${abbrev}` },
              header: `${name} (${items.length})`,
              body: (
                <div className="d-flex flex-wrap gap-1">
                  {items.map((assessment) => (
                    <AssessmentBadge
                      key={assessment.assessment_id}
                      urlPrefix={urlPrefix}
                      assessment={{
                        assessment_id: assessment.assessment_id,
                        color: assessment.assessment_set_color,
                        label: `${assessment.assessment_set_abbreviation}${assessment.assessment_number}`,
                      }}
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
