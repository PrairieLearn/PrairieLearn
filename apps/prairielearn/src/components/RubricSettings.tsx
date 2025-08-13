import { useMemo, useState } from 'preact/hooks';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import type { AssessmentQuestion, RubricItem } from '../lib/db-types.js';
import type { RubricData } from '../lib/manualGrading.js';

type RubricItemData = Partial<
  RubricItem & { num_submissions: number; disagreement_count: number | null }
>;

export function RubricSettings({
  assessment_question,
  rubric_data,
  __csrf_token,
  aiGradingStats,
}: {
  assessment_question: AssessmentQuestion;
  rubric_data: RubricData | null;
  __csrf_token: string;
  aiGradingStats: AiGradingGeneralStats | null;
}) {
  const showAiGradingStats = aiGradingStats ? true : false;
  const wasUsingRubric = rubric_data ? true : false;
  const rubricItemsWithSelectionCount = rubric_data?.rubric_items ?? [];
  const rubricItemsWithDisagreementCount = aiGradingStats?.rubric_stats ?? {};
  const rubricItemDataMerged = rubricItemsWithSelectionCount.map((itemA) => ({
    ...itemA,
    disagreement_count:
      itemA.id in rubricItemsWithDisagreementCount
        ? rubricItemsWithDisagreementCount[itemA.id]
        : null,
  }));

  // Define states
  const [editMode, setEditMode] = useState(false);
  const [rubricItems, setRubricItems] = useState<RubricItemData[]>(rubricItemDataMerged);
  const [nextNewId, setNextNewId] = useState<number>(1);
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubric_data?.replace_auto_points ?? !assessment_question.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(rubric_data?.starting_points ?? 0);
  const [minPoints, setMinPoints] = useState<number>(rubric_data?.min_points ?? 0);
  const [maxExtraPoints, SetMaxExtraPoints] = useState<number>(rubric_data?.max_extra_points ?? 0);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

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
  const addRubricItemRow = () => {
    setRubricItems((prev) => [
      ...prev,
      // Only initialize these parameters to be consistent with current new row behavior
      {
        points: 1,
        always_show_to_students: true,
      },
    ]);
    setNextNewId(nextNewId + 1);
  };

  const deleteRow = (idx: number) => {
    setRubricItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * Update current dragged row index
   * @param idx The current index of the row that is being dragged
   */
  function rowDragStart(idx: number) {
    setDraggedIdx(idx);
  }
  function rowDragOver(overIdx: number) {
    if (draggedIdx === null || draggedIdx === overIdx) return;
    setRubricItems((items) => {
      const newItems = [...items];
      [newItems[draggedIdx], newItems[overIdx]] = [newItems[overIdx], newItems[draggedIdx]];
      return newItems;
    });
    setDraggedIdx(overIdx);
  }

  // Do we need moving up and down?
  // These don't seem to exist in the JS for the current rubric edit panel
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

  const updateRubricItem = (idx: number, patch: Partial<RubricItem>) => {
    setRubricItems((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const submitSettings = async (use_rubric: boolean) => {
    if (use_rubric) {
      const required =
        document.querySelectorAll<HTMLInputElement>('#rubric-editing input[required]') ?? [];
      for (const input of Array.from(required)) {
        if (!input.reportValidity()) {
          return;
        }
      }
    }

    const payload = {
      __csrf_token,
      __action: 'modify_rubric_settings',
      use_rubric,
      modified_at: rubric_data?.modified_at?.toString() ?? '',
      replace_auto_points: replaceAutoPoints,
      starting_points: startingPoints,
      min_points: minPoints,
      max_extra_points: maxExtraPoints,
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

    const postUrl = window.location.pathname + window.location.search;

    const res = await fetch(postUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({ err: `Error: ${res.statusText}` }))) ?? {};
      if (data.err) {
        return setSettingsError(data.err);
      }
    }
    if (res.redirected) {
      window.location.replace(res.url);
    }
  };

  return (
    <div id="rubric-editing" class="card overflow-hidden p-2 mb-3">
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
                          disabled={!editMode}
                          checked={!replaceAutoPoints}
                          onChange={() => setReplaceAutoPoints(false)}
                        />
                        Apply rubric to manual points (out of{' '}
                        {assessment_question.max_manual_points}, keep auto points)
                      </label>
                    </div>
                  </div>
                  <div class="col-12 col-lg-6">
                    <div class="form-check">
                      <label class="form-check-label">
                        <input
                          class="form-check-input"
                          type="radio"
                          disabled={!editMode}
                          checked={replaceAutoPoints}
                          onChange={() => setReplaceAutoPoints(true)}
                        />
                        Apply rubric to total points (out of {assessment_question.max_points},
                        ignore auto points)
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
                      disabled={!editMode}
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
                      disabled={!editMode}
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
                    disabled={!editMode}
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
                    disabled={!editMode}
                    value={maxExtraPoints}
                    onInput={(e: any) => SetMaxExtraPoints(Number(e.currentTarget.value))}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rubric table */}
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
              {showAiGradingStats ? <td>AI agreement</td> : <td>In use</td>}
            </tr>
          </thead>
          <tbody>
            {rubricItems.length ? (
              rubricItems.map((it, idx) => (
                <RubricRow
                  key={it.id ?? `row-${idx}`}
                  idx={idx}
                  item={it}
                  editMode={editMode}
                  showAiGradingStats={showAiGradingStats}
                  submissionCount={aiGradingStats?.submission_rubric_count ?? 0}
                  deleteRow={() => deleteRow(idx)}
                  moveUp={() => moveUp(idx)}
                  moveDown={() => moveDown(idx)}
                  rowDragStart={() => rowDragStart(idx)}
                  rowDragOver={() => rowDragOver(idx)}
                  updateRubricItem={(patch) => updateRubricItem(idx, patch)}
                />
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <em>
                    This question does not have any rubric items. Click "Add item" below to add some
                    {wasUsingRubric && (
                      <>
                        , or select <strong>Disable rubric</strong> below to switch back to manual
                        grade input
                      </>
                    )}
                    .
                  </em>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pointsWarnings.map((warning) => (
        <div key={warning} class="alert alert-warning alert-dismissable fade show" role="alert">
          {warning}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" />
        </div>
      ))}
      <div>
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          disabled={!editMode}
          onClick={addRubricItemRow}
        >
          Add item
        </button>
      </div>
      {settingsError && (
        <div
          key={settingsError}
          class="alert alert-danger alert-dismissable fade show"
          role="alert"
        >
          {settingsError}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" />
        </div>
      )}

      {/* Footer actions */}
      <div class="text-end mt-2">
        <button
          type="button"
          class="btn btn-link btn-sm me-auto"
          onClick={() => submitSettings(false)}
        >
          Disable rubric
        </button>
        {!editMode ? (
          <button type="button" class="btn btn-secondary" onClick={() => setEditMode(true)}>
            Edit rubric
          </button>
        ) : (
          <>
            <button type="button" class="btn btn-secondary me-2" onClick={() => setEditMode(false)}>
              Cancel
            </button>
            <button type="button" class="btn btn-primary" onClick={() => submitSettings(true)}>
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function RubricRow({
  item,
  editMode,
  showAiGradingStats,
  submissionCount,
  deleteRow,
  moveUp,
  moveDown,
  updateRubricItem,
  rowDragStart,
  rowDragOver,
}: {
  idx: number;
  item: RubricItemData;
  editMode: boolean;
  showAiGradingStats: boolean;
  submissionCount: number;
  deleteRow: () => void;
  moveUp: () => void;
  moveDown: () => void;
  updateRubricItem: (patch: Partial<RubricItem>) => void;
  rowDragStart: () => void;
  rowDragOver: () => void;
}) {
  return (
    <tr>
      <td class="text-nowrap align-middle">
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          disabled={!editMode}
          draggable
          onDragStart={rowDragStart}
          onDragOver={rowDragOver}
        >
          <i class="fas fa-arrows-up-down" />
        </button>
        <button
          type="button"
          class="visually-hidden"
          disabled={!editMode}
          aria-label="Move up"
          onClick={moveUp}
        >
          <i class="fas fa-arrow-up" />
        </button>
        <button
          type="button"
          class="visually-hidden"
          disabled={!editMode}
          aria-label="Move down"
          onClick={moveDown}
        >
          <i class="fas fa-arrow-down" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost text-danger"
          disabled={!editMode}
          aria-label="Delete"
          onClick={deleteRow}
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
          disabled={!editMode}
          value={item.points}
          aria-label="Points"
          required
          onInput={(e: any) => updateRubricItem({ points: Number(e.currentTarget.value) })}
        />
      </td>

      <td class="align-middle">
        <input
          type="text"
          class="form-control"
          disabled={!editMode}
          maxlength={100}
          style="min-width:15rem"
          value={item.description}
          aria-label="Description"
          required
          onInput={(e: any) => updateRubricItem({ description: e.currentTarget.value })}
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxlength={10000}
          style="min-width:15rem"
          value={item.explanation ?? ''}
          aria-label="Explanation"
          onInput={(e: any) => updateRubricItem({ explanation: e.currentTarget.value })}
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxlength={10000}
          style="min-width:15rem"
          value={item.grader_note ?? ''}
          aria-label="Grader note"
          onInput={(e: any) => updateRubricItem({ grader_note: e.currentTarget.value })}
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
              onChange={() => updateRubricItem({ always_show_to_students: true })}
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
              onChange={() => updateRubricItem({ always_show_to_students: false })}
            />
            If selected
          </label>
        </div>
      </td>

      {showAiGradingStats ? (
        <td class="align-middle">
          {submissionCount === 0 ? (
            <span>&mdash;</span>
          ) : item.disagreement_count === undefined || item.disagreement_count === null ? (
            <span>New</span>
          ) : item.disagreement_count ? (
            <>
              <i class="bi bi-x-square-fill text-danger" />{' '}
              <span class="text-muted">
                ({item.disagreement_count}/{submissionCount} disagree)
              </span>
            </>
          ) : (
            <i class="bi bi-check-square-fill text-success" />
          )}
        </td>
      ) : (
        <td class="text-nowrap align-middle">
          {item.num_submissions === undefined
            ? 'New'
            : !item.num_submissions
              ? 'No'
              : item.num_submissions === 1
                ? '1 submission'
                : `${item.num_submissions} submissions`}
        </td>
      )}
    </tr>
  );
}
