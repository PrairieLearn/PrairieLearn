import { useEffect, useMemo, useState } from 'preact/hooks';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import type { AssessmentQuestion, RubricItem } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.js';

type RubricItemData = Partial<RubricItem & { num_submissions: number | null }>;

export function AssessmentQuestionRubricTable({
  assessment_question,
  rubric_data,
  __csrf_token,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingStats,
}: {
  assessment_question: AssessmentQuestion;
  rubric_data: RubricData | null | undefined;
  __csrf_token: string;
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  aiGradingStats: AiGradingGeneralStats;
}) {
  const showAiGradingStats = true; // TODO: change to use enabled and mode

  // Define states
  const [editMode, setEditMode] = useState(false);
  const [rubricItems, setRubricItems] = useState<RubricItemData[]>(rubric_data?.rubric_items ?? []);
  console.log(rubricItems);
  const [nextNewId, setNextNewId] = useState<number>(1);
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubric_data?.replace_auto_points ?? !assessment_question.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(rubric_data?.starting_points ?? 0);
  const [minPoints, setMinPoints] = useState<number>(rubric_data?.min_points ?? 0);
  const [maxExtraPoints, SetMaxExtraPoints] = useState<number>(rubric_data?.max_extra_points ?? 0);

  // Derived totals/warnings
  const { totalPositive, totalNegative } = useMemo(() => {
    const [pos, neg] = rubricItems
      .map((item) => item.points ?? 0)
      .reduce<
        [number, number]
      >(([p, n], v) => (v > 0 ? [p + v, n] : [p, n + v]), [startingPoints, startingPoints]);
    return { totalPositive: pos, totalNegative: neg };
  }, [rubricItems, startingPoints]);

  const maxPoints = (assessment_question.max_manual_points ?? 0) + maxExtraPoints;

  const pointsWarnings: string[] = useMemo(() => {
    const warnings: string[] = [];
    if (totalPositive < maxPoints) {
      warnings.push(
        `Rubric item points reach at most ${totalPositive} points. ${
          maxPoints - totalPositive
        } left to reach maximum.`,
      );
    }
    if (totalNegative > minPoints) {
      warnings.push(`Minimum grade from rubric item penalties is ${totalNegative} points.`);
    }
    return warnings;
  }, [totalPositive, totalNegative, maxPoints, minPoints]);

  // Handlers
  const onAddItem = () => {
    setRubricItems((prev) => [
      ...prev,
      {
        id: undefined,
        points: 1,
        description: '',
        explanation: '',
        grader_note: '',
        always_show_to_students: true,
      },
    ]);
    setNextNewId(nextNewId + 1);
  };

  const onDelete = (idx: number) => {
    setRubricItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setRubricItems((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setRubricItems((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
  };

  const onRowChange = (idx: number, patch: Partial<RubricItem>) => {
    setRubricItems((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const onSave = async () => {
    const payload = {
      __csrf_token,
      __action: 'modify_rubric_settings',
      use_rubric: 'true',
      modified_at: rubric_data?.modified_at?.toString() ?? '',
      replace_auto_points: String(replaceAutoPoints),
      starting_points: String(startingPoints),
      min_points: String(minPoints),
      max_extra_points: String(maxExtraPoints),
      rubric_items: rubricItems.map((it, idx) => ({
        id: it.id,
        order: idx,
        points: it.points,
        description: it.description,
        explanation: it.explanation,
        grader_note: it.grader_note,
        always_show_to_students: it.always_show_to_students,
      })),
    };

    const body = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        body.set(k, JSON.stringify(v));
      } else {
        body.set(k, String(v));
      }
    });

    const res = await fetch('', { method: 'POST', body });
    if (!res.ok) {
      alert(`Save failed: ${res.statusText}`);
      return;
    }
    setEditMode(false);
  };

  return (
    <div class="card overflow-hidden p-2 mb-3">
      {/* Settings */}
      <div class="card mb-2 mt-1">
        <button
          type="button"
          class="card-header d-flex border-top-0 border-start-0 border-end-0 text-start"
          data-bs-toggle="collapse"
          data-bs-target="#rubric-setting"
        >
          <div class="card-title mb-0 me-auto d-flex align-items-center">Rubric settings</div>
        </button>
        <div id="rubric-setting" class="collapse p-2">
          <SettingsPanel
            assessment_question={assessment_question}
            replaceAutoPoints={replaceAutoPoints}
            setReplaceAutoPoints={setReplaceAutoPoints}
            startingPoints={startingPoints}
            setStartingPoints={setStartingPoints}
            minPoints={minPoints}
            setMinPoints={setMinPoints}
            maxExtraPoints={maxExtraPoints}
            SetMaxExtraPoints={SetMaxExtraPoints}
          />
        </div>
      </div>

      {/* Rubric table */}
      <RubricTable
        items={rubricItems}
        editMode={editMode}
        showAiGradingStats={showAiGradingStats}
        submissionCount={aiGradingStats.submission_rubric_count}
        disagreements={
          new Map(
            aiGradingStats.rubric_stats.map((s) => [s.rubric_item.id, s.disagreement_count || 0]),
          )
        }
        onAddItem={onAddItem}
        onDelete={onDelete}
        moveUp={moveUp}
        moveDown={moveDown}
        onRowChange={onRowChange}
      />

      {/* Warnings */}
      {pointsWarnings.map((warning) => (
        <div key={warning} class="alert alert-warning alert-dismissable fade show" role="alert">
          {warning}
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="alert"
            aria-label="Close"
          ></button>
        </div>
      ))}

      {/* Footer actions */}
      <div class="text-end mt-2">
        {!editMode ? (
          <button type="button" class="btn btn-secondary" onClick={() => setEditMode(true)}>
            Edit rubric
          </button>
        ) : (
          <>
            <button type="button" class="btn btn-secondary me-2" onClick={() => setEditMode(false)}>
              Cancel
            </button>
            <button type="button" class="btn btn-primary" onClick={onSave}>
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  assessment_question,
  replaceAutoPoints,
  setReplaceAutoPoints,
  startingPoints,
  setStartingPoints,
  minPoints,
  setMinPoints,
  maxExtraPoints,
  SetMaxExtraPoints,
}: {
  assessment_question: AssessmentQuestion;
  replaceAutoPoints: boolean;
  setReplaceAutoPoints: (v: boolean) => void;
  startingPoints: number;
  setStartingPoints: (v: number) => void;
  minPoints: number;
  setMinPoints: (v: number) => void;
  maxExtraPoints: number;
  SetMaxExtraPoints: (v: number) => void;
}) {
  return (
    <div>
      {!!assessment_question.max_auto_points && (
        <>
          <div class="row">
            <div class="col-12 col-lg-6">
              <div class="form-check">
                <label class="form-check-label">
                  <input
                    class="form-check-input"
                    type="radio"
                    checked={!replaceAutoPoints}
                    onChange={() => setReplaceAutoPoints(false)}
                  />
                  Apply rubric to manual points (out of {assessment_question.max_manual_points},
                  keep auto points)
                </label>
              </div>
            </div>
            <div class="col-12 col-lg-6">
              <div class="form-check">
                <label class="form-check-label">
                  <input
                    class="form-check-input"
                    type="radio"
                    checked={replaceAutoPoints}
                    onChange={() => setReplaceAutoPoints(true)}
                  />
                  Apply rubric to total points (out of {assessment_question.max_points}, ignore auto
                  points)
                </label>
              </div>
            </div>
          </div>
          <hr />
        </>
      )}

      <div class="row">
        <div class="col-12 col-lg-6">
          <div class="form-check">
            <label class="form-check-label">
              <input
                class="form-check-input"
                type="radio"
                checked={startingPoints === 0}
                onChange={() => setStartingPoints(0)}
              />
              Positive grading (start at zero, add points)
            </label>
          </div>
          <div class="form-check">
            <label class="form-check-label">
              <input
                class="form-check-input"
                type="radio"
                checked={startingPoints !== 0}
                onChange={() => setStartingPoints(assessment_question.max_manual_points ?? 0)}
              />
              Negative grading (start at {assessment_question.max_manual_points}, subtract
              penalties)
            </label>
          </div>
        </div>

        <div class="mb-3 col-6 col-lg-3">
          <label class="form-label">
            Minimum rubric score
            <input
              class="form-control"
              type="number"
              value={minPoints}
              onInput={(e: any) => setMinPoints(Number(e.currentTarget.value))}
            />
          </label>
        </div>
        <div class="mb-3 col-6 col-lg-3">
          <label class="form-label">
            Maximum extra credit
            <input
              class="form-control"
              type="number"
              value={maxExtraPoints}
              onInput={(e: any) => SetMaxExtraPoints(Number(e.currentTarget.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function RubricTable({
  items,
  editMode,
  showAiGradingStats,
  submissionCount,
  disagreements,
  onAddItem,
  onDelete,
  moveUp,
  moveDown,
  onRowChange,
}: {
  items: RubricItemData[];
  editMode: boolean;
  showAiGradingStats: boolean;
  submissionCount: number;
  disagreements: Map<string, number>;
  onAddItem: () => void;
  onDelete: (idx: number) => void;
  moveUp: (idx: number) => void;
  moveDown: (idx: number) => void;
  onRowChange: (idx: number, patch: Partial<RubricItem>) => void;
}) {
  return (
    <div class="table-responsive">
      <table class="table table-sm border-bottom mb-3" aria-label="Rubric items">
        <thead>
          <tr class="table-light fw-bold">
            <td style="width:1px" />
            <td>Points</td>
            <td>Description</td>
            <td>Detailed explanation</td>
            <td>Grader note</td>
            <td>Show to students</td>
            {showAiGradingStats && <td>AI agreement</td>}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <RubricRow
              key={it.id ?? `row-${idx}`}
              idx={idx}
              item={it}
              editMode={editMode}
              showAiGradingStats={showAiGradingStats}
              submissionCount={submissionCount}
              disagreementCount={disagreements.get(it.id ?? '')}
              onDelete={() => onDelete(idx)}
              moveUp={() => moveUp(idx)}
              moveDown={() => moveDown(idx)}
              onChange={(patch) => onRowChange(idx, patch)}
            />
          ))}
        </tbody>
      </table>

      <div class="js-add-rubric-item-button-container">
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          disabled={!editMode}
          onClick={onAddItem}
        >
          Add item
        </button>
      </div>
    </div>
  );
}

function RubricRow({
  item,
  editMode,
  showAiGradingStats,
  submissionCount,
  disagreementCount,
  onDelete,
  moveUp,
  moveDown,
  onChange,
}: {
  idx: number;
  item: RubricItemData;
  editMode: boolean;
  showAiGradingStats: boolean;
  submissionCount: number;
  disagreementCount?: number;
  onDelete: () => void;
  moveUp: () => void;
  moveDown: () => void;
  onChange: (patch: Partial<RubricItem>) => void;
}) {
  return (
    <tr>
      <td class="text-nowrap align-middle">
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          disabled={!editMode}
          onClick={moveUp}
          aria-label="Move up"
        >
          <i class="fas fa-arrow-up" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          disabled={!editMode}
          onClick={moveDown}
          aria-label="Move down"
        >
          <i class="fas fa-arrow-down" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost text-danger"
          disabled={!editMode}
          onClick={onDelete}
          aria-label="Delete"
        >
          <i class="fas fa-trash text-danger" />
        </button>
      </td>

      <td class="align-middle">
        <input
          type="number"
          class="form-control"
          style="width:4rem"
          step="any"
          required
          disabled={!editMode}
          value={item.points}
          onInput={(e: any) => onChange({ points: Number(e.currentTarget.value) })}
          aria-label="Points"
        />
      </td>

      <td class="align-middle">
        <input
          type="text"
          class="form-control"
          required
          disabled={!editMode}
          maxlength={100}
          style="min-width:15rem"
          value={item.description}
          onInput={(e: any) => onChange({ description: e.currentTarget.value })}
          aria-label="Description"
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxlength={10000}
          style="min-width:15rem"
          value={item.explanation ?? ''}
          onInput={(e: any) => onChange({ explanation: e.currentTarget.value })}
          aria-label="Explanation"
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxlength={10000}
          style="min-width:15rem"
          value={item.grader_note ?? ''}
          onInput={(e: any) => onChange({ grader_note: e.currentTarget.value })}
          aria-label="Grader note"
        />
      </td>

      <td class="align-middle">
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input"
              disabled={!editMode}
              checked={item.always_show_to_students}
              onChange={() => onChange({ always_show_to_students: true })}
            />
            Always
          </label>
        </div>
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input"
              disabled={!editMode}
              checked={!item.always_show_to_students}
              onChange={() => onChange({ always_show_to_students: false })}
            />
            If selected
          </label>
        </div>
      </td>

      {showAiGradingStats && (
        <td class="align-middle">
          {submissionCount === 0 ? (
            <span>&mdash;</span>
          ) : disagreementCount === undefined ? (
            <span>New</span>
          ) : disagreementCount ? (
            <>
              <i class="bi bi-x-square-fill text-danger" />{' '}
              <span class="text-muted">
                ({disagreementCount}/{submissionCount} disagree)
              </span>
            </>
          ) : (
            <i class="bi bi-check-square-fill text-success" />
          )}
        </td>
      )}
    </tr>
  );
}
