import type { inferRouterOutputs } from '@trpc/server';

import { run } from '@prairielearn/run';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import type { CourseRouter } from '../../../trpc/course/trpc.js';

export type AssessmentChecklistItem =
  inferRouterOutputs<CourseRouter>['questions']['listAssessments'][number];

/**
 * A checkbox list of assessments grouped by assessment set into collapsible
 * `<details>` blocks. Selection state is owned by the caller. The caller is
 * responsible for filtering `assessments` to the ones that should be shown.
 */
export function AssessmentChecklist({
  idPrefix,
  assessments,
  isLoading,
  selectedAssessmentIds,
  onToggle,
  emptyMessage,
}: {
  idPrefix: string;
  assessments: AssessmentChecklistItem[];
  isLoading: boolean;
  selectedAssessmentIds: Set<string>;
  onToggle: (assessmentId: string) => void;
  emptyMessage: string;
}) {
  // Group assessments by set, preserving the query order (already sorted by set
  // number, then assessment order).
  const setGroups = run(() => {
    const groups = new Map<
      string,
      { set: AssessmentChecklistItem['set']; rows: AssessmentChecklistItem[] }
    >();
    for (const assessment of assessments) {
      const group = groups.get(assessment.set.id);
      if (group) {
        group.rows.push(assessment);
      } else {
        groups.set(assessment.set.id, { set: assessment.set, rows: [assessment] });
      }
    }
    return [...groups.values()];
  });

  return (
    <fieldset className="mb-3">
      <legend className="form-label">Assessments</legend>
      {run(() => {
        if (isLoading) {
          return <div className="text-muted">Loading assessments…</div>;
        }
        if (assessments.length === 0) {
          return <div className="text-muted">{emptyMessage}</div>;
        }
        return setGroups.map((group) => (
          <details key={group.set.id} className="mb-2">
            <summary className="fw-bold">
              <AssessmentSetHeading assessmentSet={group.set} />
            </summary>
            <div className="ps-3 pt-2">
              {group.rows.map((assessment) => {
                const checkboxId = `${idPrefix}-${assessment.id}`;
                return (
                  <div key={assessment.id} className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={checkboxId}
                      checked={selectedAssessmentIds.has(assessment.id)}
                      onChange={() => onToggle(assessment.id)}
                    />
                    <label className="form-check-label" htmlFor={checkboxId}>
                      <span className={`badge color-${assessment.set.color}`}>
                        {assessment.label}
                      </span>
                      {assessment.title ? ` ${assessment.title}` : ''}
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        ));
      })}
    </fieldset>
  );
}
