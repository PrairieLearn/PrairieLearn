import clsx from 'clsx';
import { useMemo, useState } from 'preact/hooks';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import type { AssessmentQuestion, RubricItem } from '../lib/db-types.js';
import type { RubricData } from '../lib/manualGrading.types.js';

type RubricItemData = Partial<
  RubricItem & { num_submissions: number; disagreement_count: number | null }
>;

export function RubricSettings({
  assessmentQuestion,
  rubricData,
  csrfToken,
  aiGradingStats,
}: {
  assessmentQuestion: AssessmentQuestion;
  rubricData: RubricData | null;
  csrfToken: string;
  aiGradingStats: AiGradingGeneralStats | null;
}) {
  const showAiGradingStats = Boolean(aiGradingStats);
  const wasUsingRubric = Boolean(rubricData);
  const rubricItemsWithSelectionCount = rubricData?.rubric_items ?? [];
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
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubricData?.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(rubricData?.starting_points ?? 0);
  const [minPoints, setMinPoints] = useState<number>(rubricData?.min_points ?? 0);
  const [maxExtraPoints, setMaxExtraPoints] = useState<number>(rubricData?.max_extra_points ?? 0);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Derived totals/warnings
  const { totalPositive, totalNegative } = useMemo(() => {
    const [pos, neg] = rubricItems
      .map((item) => (item.points ? Number(item.points) : 0))
      .reduce<
        [number, number]
      >(([p, n], v) => (v > 0 ? [p + v, n] : [p, n + v]), [startingPoints, startingPoints]);
    return { totalPositive: pos, totalNegative: neg };
  }, [rubricItems, startingPoints]);

  const maxPoints =
    (replaceAutoPoints
      ? (assessmentQuestion.max_points ?? 0)
      : (assessmentQuestion.max_manual_points ?? 0)) + maxExtraPoints;

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
  };

  const deleteRow = (idx: number) => {
    setRubricItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * Update current dragged row index
   * @param idx The current index of the row that is being dragged
   */
  function onDragStart(idx: number) {
    setDraggedIdx(idx);
  }
  function onDragOver(overIdx: number) {
    if (draggedIdx === null || draggedIdx === overIdx) return;
    setRubricItems((items) => {
      const newItems = [...items];
      [newItems[draggedIdx], newItems[overIdx]] = [newItems[overIdx], newItems[draggedIdx]];
      return newItems;
    });
    setDraggedIdx(overIdx);
  }

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

  const onCancel = () => {
    setRubricItems(rubricItemDataMerged);
    setReplaceAutoPoints(rubricData?.replace_auto_points ?? !assessmentQuestion.max_manual_points);
    setStartingPoints(rubricData?.starting_points ?? 0);
    setMinPoints(rubricData?.min_points ?? 0);
    setMaxExtraPoints(rubricData?.max_extra_points ?? 0);
    setSettingsError(null);
    setEditMode(false);
  };

  const submitSettings = async (use_rubric: boolean) => {
    // Performs validation on the required inputs
    if (use_rubric) {
      const required =
        document.querySelectorAll<HTMLInputElement>('#rubric-editing input[required]') ?? [];
      const isValid = Array.from(required).every((input) => input.reportValidity());
      if (!isValid) {
        return;
      }
    }

    const payload = {
      __csrf_token: csrfToken,
      __action: 'modify_rubric_settings',
      use_rubric,
      modified_at: rubricData?.modified_at?.toString() ?? '',
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

    const res = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let data: { err: any };
      try {
        data = (await res.json()) ?? {};
      } catch {
        data = { err: `Error: ${res.statusText}` };
      }
      if (data.err) {
        return setSettingsError(data.err);
      }
    }
    if (res.redirected) {
      window.location.replace(res.url);
    }
  };

  return (
    <div id="rubric-editing" class="card overflow-hidden mb-3">
      <div class="card-header collapsible-card-header d-flex align-items-center">
        <h2>Rubric Settings</h2>
        <button
          type="button"
          class="expand-icon-container btn btn-secondary btn-sm text-nowrap ms-auto collapsed"
          data-bs-toggle="collapse"
          data-bs-target="#rubric-setting"
          aria-expanded="false"
          aria-controls="#rubric-setting"
        >
          <i class="fa fa-angle-up ms-1 expand-icon" />
        </button>
      </div>
      <div id="rubric-setting" class="js-collapsible-card-body p-2 collapse">
        {/* Settings */}
        <div>
          {!!assessmentQuestion.max_auto_points && (
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
                        onChange={() => {
                          setReplaceAutoPoints(false);
                          if (startingPoints !== 0) {
                            setStartingPoints(assessmentQuestion.max_manual_points ?? 0);
                          }
                        }}
                      />
                      Apply rubric to manual points (out of {assessmentQuestion.max_manual_points},
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
                        disabled={!editMode}
                        checked={replaceAutoPoints}
                        onChange={() => {
                          setReplaceAutoPoints(true);
                          if (startingPoints !== 0) {
                            setStartingPoints(assessmentQuestion.max_points ?? 0);
                          }
                        }}
                      />
                      Apply rubric to total points (out of {assessmentQuestion.max_points}, ignore
                      auto points)
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
                    onChange={() =>
                      setStartingPoints(
                        replaceAutoPoints
                          ? (assessmentQuestion.max_points ?? 0)
                          : (assessmentQuestion.max_manual_points ?? 0),
                      )
                    }
                  />
                  Negative grading (start at{' '}
                  {replaceAutoPoints
                    ? assessmentQuestion.max_points
                    : assessmentQuestion.max_manual_points}
                  , subtract penalties)
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
                  onInput={(e: any) => setMinPoints(Number(e.target.value))}
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
                  onInput={(e: any) => setMaxExtraPoints(Number(e.target.value))}
                />
              </label>
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
              {rubricItems.length > 0 ? (
                rubricItems.map((it, idx) => (
                  <RubricRow
                    key={it.id ?? `row-${idx}`}
                    item={it}
                    editMode={editMode}
                    showAiGradingStats={showAiGradingStats}
                    submissionCount={aiGradingStats?.submission_rubric_count ?? 0}
                    deleteRow={() => deleteRow(idx)}
                    moveUp={() => moveUp(idx)}
                    moveDown={() => moveDown(idx)}
                    updateRubricItem={(patch) => updateRubricItem(idx, patch)}
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={() => onDragOver(idx)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <em>
                      This question does not have any rubric items! Click "Add item" below to add
                      some
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

        {/* Warnings */}
        {pointsWarnings.map((warning) => (
          <div key={warning} class="alert alert-warning alert-dismissible fade show" role="alert">
            {warning}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" />
          </div>
        ))}
        <div class="mb-3">
          <button
            type="button"
            class="btn btn-secondary"
            disabled={!editMode}
            onClick={addRubricItemRow}
          >
            Add item
          </button>
        </div>
        {settingsError && (
          <div
            key={settingsError}
            class="alert alert-danger alert-dismissible fade show"
            role="alert"
          >
            {settingsError}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" />
          </div>
        )}

        {/* Footer actions */}
        <div class="text-end">
          {wasUsingRubric && (
            <button
              type="button"
              class="btn btn-link btn-sm me-auto text-danger"
              onClick={() => submitSettings(false)}
            >
              Delete rubric
            </button>
          )}
          {!editMode ? (
            <button type="button" class="btn btn-secondary" onClick={() => setEditMode(true)}>
              Edit rubric
            </button>
          ) : (
            <>
              <button type="button" class="btn btn-secondary me-2" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" class="btn btn-primary" onClick={() => submitSettings(true)}>
                Save
              </button>
            </>
          )}
        </div>
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
  onDragStart,
  onDragOver,
}: {
  item: RubricItemData;
  editMode: boolean;
  showAiGradingStats: boolean;
  submissionCount: number;
  deleteRow: () => void;
  moveUp: () => void;
  moveDown: () => void;
  updateRubricItem: (patch: Partial<RubricItem>) => void;
  onDragStart: () => void;
  onDragOver: () => void;
}) {
  return (
    <tr
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
    >
      <td class="text-nowrap align-middle">
        <span
          role="button"
          tabIndex={editMode ? 0 : -1}
          aria-disabled={!editMode}
          class={`btn btn-sm btn-ghost ${clsx({ disabled: !editMode })}`}
          style={{ cursor: 'grab' }}
          draggable={editMode}
          onDragStart={onDragStart}
        >
          <i class="fas fa-arrows-up-down" />
        </span>
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
          onInput={(e: any) => updateRubricItem({ points: e.target.value })}
        />
      </td>

      <td class="align-middle">
        <input
          type="text"
          class="form-control"
          disabled={!editMode}
          maxLength={100}
          style="min-width:15rem"
          value={item.description}
          aria-label="Description"
          required
          onInput={(e: any) => updateRubricItem({ description: e.target.value })}
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxLength={10000}
          style="min-width:15rem"
          aria-label="Explanation"
          onInput={(e: any) => updateRubricItem({ explanation: e.target.value })}
        >
          {item.explanation}
        </textarea>
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          disabled={!editMode}
          maxLength={10000}
          style="min-width:15rem"
          aria-label="Grader note"
          onInput={(e: any) => updateRubricItem({ grader_note: e.target.value })}
        >
          {item.grader_note}
        </textarea>
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
          ) : item.disagreement_count == null ? (
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
          {item.num_submissions == null
            ? 'New'
            : item.num_submissions === 0
              ? 'No'
              : item.num_submissions === 1
                ? '1 submission'
                : `${item.num_submissions} submissions`}
        </td>
      )}
    </tr>
  );
}

RubricSettings.displayName = 'RubricSettings';
