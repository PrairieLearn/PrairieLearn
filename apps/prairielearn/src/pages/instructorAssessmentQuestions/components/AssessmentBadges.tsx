import type { ReactNode } from 'react';

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

const WARNING_PREFIX = <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />;

function MarkedBadge({
  assessment,
  courseInstanceId,
  marked,
  useSetColor,
  tooltipLabel,
  tooltipIdPrefix,
}: {
  assessment: AssessmentForPicker;
  courseInstanceId: string;
  marked: boolean;
  useSetColor: boolean;
  tooltipLabel: string;
  tooltipIdPrefix: string;
}) {
  const badge = (
    <AssessmentBadge
      courseInstanceId={courseInstanceId}
      assessment={toBadgeProps(assessment, useSetColor)}
      prefix={marked ? WARNING_PREFIX : undefined}
    />
  );
  if (!marked) return badge;
  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        body: tooltipLabel,
        props: { id: `${tooltipIdPrefix}-${courseInstanceId}-${assessment.assessment_id}` },
      }}
    >
      <span className="d-inline-block" data-testid="zone-removal-marker">
        {badge}
      </span>
    </OverlayTrigger>
  );
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
 *
 * `markedAssessmentIds` decorates marked badges (and any collapsed group
 * containing at least one marked assessment) with a warning-icon prefix
 * inside the pill. Used by the bulk-delete preview to indicate assessments
 * that will have a zone removed.
 */
export function AssessmentBadges({
  assessments,
  courseInstanceId,
  markedAssessmentIds,
  markedSingleLabel = 'A zone in this assessment will be removed',
  markedGroupLabel = 'A zone in one or more of these assessments will be removed',
  stopGroupClickPropagation = true,
}: {
  assessments: AssessmentForPicker[];
  courseInstanceId: string;
  markedAssessmentIds?: ReadonlySet<string>;
  markedSingleLabel?: string;
  markedGroupLabel?: string;
  /**
   * Whether the `×N` group button stops click propagation. Defaults to true
   * for the TreeQuestionRow use case (where the surrounding row has its own
   * click handler). Set to false in contexts where multiple group popovers
   * coexist, so that opening one closes the others via `rootClose`.
   */
  stopGroupClickPropagation?: boolean;
}) {
  if (assessments.length === 0) {
    return null;
  }

  const isMarked = (id: string) => markedAssessmentIds?.has(id) ?? false;
  const renderBadge = (assessment: AssessmentForPicker, useSetColor: boolean, idPrefix: string) => (
    <MarkedBadge
      assessment={assessment}
      courseInstanceId={courseInstanceId}
      marked={isMarked(assessment.assessment_id)}
      useSetColor={useSetColor}
      tooltipLabel={markedSingleLabel}
      tooltipIdPrefix={idPrefix}
    />
  );

  const grouped = groupByAbbreviation(assessments);

  if (!grouped) {
    return (
      <>
        {assessments.slice(0, 3).map((assessment) => (
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            {renderBadge(assessment, false, 'zone-removal')}
          </span>
        ))}
        {assessments.length > 3 && (
          <span className="badge bg-secondary">+{assessments.length - 3}</span>
        )}
      </>
    );
  }

  const elements: ReactNode[] = [];

  for (const [abbrev, items] of grouped) {
    if (items.length < 3) {
      for (const assessment of items) {
        elements.push(
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            {renderBadge(assessment, true, 'zone-removal')}
          </span>,
        );
      }
      continue;
    }

    const color = items[0].assessment_set_color ?? items[0].color;
    const name = items[0].assessment_set_name ?? abbrev;
    const groupHasMarked = items.some((a) => isMarked(a.assessment_id));
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
                  <span key={assessment.assessment_id} className="d-inline-block">
                    {renderBadge(assessment, true, 'zone-removal-popover')}
                  </span>
                ))}
              </div>
            ),
          }}
          rootClose
        >
          <button
            type="button"
            className={`btn btn-badge color-${color} tree-interactive-badge`}
            aria-label={
              groupHasMarked
                ? `${abbrev}: ${items.length} assessments. ${markedGroupLabel}`
                : `${abbrev}: ${items.length} assessments`
            }
            onClick={stopGroupClickPropagation ? (e) => e.stopPropagation() : undefined}
          >
            {groupHasMarked && WARNING_PREFIX}
            {abbrev} ×{items.length}{' '}
            <i className="bi bi-caret-down-fill" style={{ fontSize: '0.6em' }} aria-hidden="true" />
          </button>
        </OverlayTrigger>
      </span>,
    );
  }

  return <>{elements}</>;
}
