import { useMemo, useRef, useState } from 'preact/hooks';
import { Modal } from 'react-bootstrap';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import { downloadAsJSON } from '../lib/client/downloads.js';
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
  context,
}: {
  assessmentQuestion: AssessmentQuestion;
  rubricData: RubricData | null;
  csrfToken: string;
  aiGradingStats: AiGradingGeneralStats | null;
  context: Record<string, any>;
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
  const [rubricItems, setRubricItems] = useState<RubricItemData[]>(rubricItemDataMerged);
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubricData?.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(rubricData?.starting_points ?? 0);
  const [minPoints, setMinPoints] = useState<number>(rubricData?.min_points ?? 0);
  const [maxExtraPoints, setMaxExtraPoints] = useState<number>(rubricData?.max_extra_points ?? 0);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importModalWarning, setImportModalWarning] = useState<string | null>(null);
  const rubricFile = useRef<HTMLInputElement>(null);

  // Derived totals/warnings
  const { totalPositive, totalNegative } = useMemo(() => {
    const [pos, neg] = rubricItems
      .map((item) => (item.points ? Number(item.points) : 0))
      .reduce<
        [number, number]
      >(([p, n], v) => (v > 0 ? [p + v, n] : [p, n + v]), [startingPoints, startingPoints]);
    return { totalPositive: roundPoints(pos), totalNegative: roundPoints(neg) };
  }, [rubricItems, startingPoints]);

  const maxPoints = roundPoints(
    (replaceAutoPoints
      ? (assessmentQuestion.max_points ?? 0)
      : (assessmentQuestion.max_manual_points ?? 0)) + maxExtraPoints,
  );

  const pointsWarnings: string[] = useMemo(() => {
    const warnings: string[] = [];
    if (totalPositive < maxPoints) {
      warnings.push(
        `Rubric item points reach at most ${totalPositive} points. ${roundPoints(
          maxPoints - totalPositive,
        )} left to reach maximum.`,
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
  };

  const exportRubric = () => {
    const rubricData = {
      max_extra_points: maxExtraPoints,
      min_points: minPoints,
      replace_auto_points: replaceAutoPoints,
      starting_points: startingPoints,
      max_points: assessmentQuestion.max_points,
      max_manual_points: assessmentQuestion.max_manual_points,
      max_auto_points: assessmentQuestion.max_auto_points,
      rubric_items: rubricItems.map((it, idx) => ({
        order: idx,
        points: it.points ? Number(it.points) : null,
        description: it.description,
        explanation: it.explanation ?? '',
        grader_note: it.grader_note ?? '',
        always_show_to_students: it.always_show_to_students,
      })),
    };

    const { course_short_name, course_instance_short_name, assessment_tid, question_qid } = context;
    const exportFileName =
      `${course_short_name}__${course_instance_short_name}__${assessment_tid}__${question_qid}__rubric_settings`.replaceAll(
        /[^a-zA-Z0-9_-]/g,
        '_',
      ) + '.json';
    downloadAsJSON(rubricData, exportFileName);
  };

  /**
   * Rounds the points for a rubric item to two decimal places
   * @param points original points
   * @returns rounded points
   */
  function roundPoints(points: number) {
    return Math.round(Number(points) * 100) / 100;
  }

  const resetImportModal = () => {
    setShowImportModal(false);
    setImportModalWarning(null);
  };

  const importRubric = async () => {
    const input = rubricFile.current;
    if (!input?.files || input.files.length === 0) {
      setImportModalWarning('Please select a file to import.');
      return;
    }
    const file = input.files[0];

    try {
      const fileContent = await file.text();
      if (fileContent.trim() === '') {
        return;
      }
      let parsedData;
      try {
        parsedData = JSON.parse(fileContent);
      } catch {
        setImportModalWarning('Error parsing JSON file, please check the file format.');
        return;
      }

      // This factor scales the imported rubric point values to ensure that they
      // are correctly aligned with the point values of the recipient question.
      let scaleFactor = 1;

      if (!parsedData.max_auto_points || parsedData.replace_auto_points) {
        // If the rubric does not use auto points, or if it replaces auto points,
        // then the scale factor is based on max_points (the total point gs of the rubric)
        const maxPoints = assessmentQuestion.max_points ?? 0;

        if (maxPoints > 0 && parsedData.max_points) {
          scaleFactor = maxPoints / parsedData.max_points;
        }
      } else {
        // If the rubric uses auto points and does not replace them, it
        // applies only to the manual points of the assessment question.
        // Therefore, we base the scale factor on max_manual_points.
        const maxManualPoints = assessmentQuestion.max_manual_points ?? 0;

        if (maxManualPoints > 0 && parsedData.max_manual_points) {
          scaleFactor = maxManualPoints / parsedData.max_manual_points;
        }
      }
      setMaxExtraPoints(roundPoints((parsedData.max_extra_points || 0) * scaleFactor));
      setMinPoints(roundPoints((parsedData.min_points || 0) * scaleFactor));
      setReplaceAutoPoints(Boolean(parsedData.replace_auto_points));
      setStartingPoints(roundPoints((parsedData.starting_points || 0) * scaleFactor));

      const rubricItems = parsedData.rubric_items;
      if (!rubricItems || !Array.isArray(rubricItems)) {
        setImportModalWarning('Invalid rubric data format. Expected rubric_items to be an array.');
        return;
      }

      const scaledRubricItems: RubricItemData[] = [];
      for (const rubricItem of rubricItems) {
        scaledRubricItems.push({
          ...rubricItem,
          points: roundPoints((rubricItem.points ?? 0) * scaleFactor),
        });
      }
      setRubricItems(scaledRubricItems);
      resetImportModal();
    } catch {
      setImportModalWarning('Error reading file content.');
    }
  };

  const submitSettings = async (use_rubric: boolean) => {
    // Performs validation on the required inputs
    if (use_rubric) {
      const required = document.querySelectorAll<HTMLInputElement>(
        '#rubric-editing input[required]',
      );
      const isValid = Array.from(required).every((input) => input.reportValidity());
      if (!isValid) {
        return;
      }
    }

    const payload = {
      __csrf_token: csrfToken,
      __action: 'modify_rubric_settings',
      use_rubric,
      modified_at: rubricData?.modified_at.toString() ?? '',
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
        <h2>Rubric settings</h2>
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
          {assessmentQuestion.max_auto_points != null && assessmentQuestion.max_auto_points > 0 && (
            <>
              <div class="row">
                <div class="col-12 col-lg-6">
                  <div class="form-check">
                    <label class="form-check-label">
                      <input
                        class="form-check-input"
                        type="radio"
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
        <div class="mb-3 gap-1 d-flex">
          <button type="button" class="btn btn-sm btn-secondary" onClick={addRubricItemRow}>
            Add item
          </button>
          <button type="button" class="btn btn-sm btn-primary" onClick={exportRubric}>
            <i class="fas fa-download" />
            Export rubric
          </button>
          <button
            id="import-rubric-button"
            type="button"
            class="btn btn-sm btn-primary"
            onClick={() => setShowImportModal(!showImportModal)}
          >
            <i class="fas fa-upload" />
            Import rubric
          </button>
          <Modal show={showImportModal} size="lg" onHide={() => resetImportModal()}>
            <Modal.Header closeButton>
              <Modal.Title>Import rubric settings</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <label class="form-label" for="rubric-settings-file-input">
                Choose file
              </label>
              <input
                ref={rubricFile}
                type="file"
                name="file"
                class="form-control"
                id="rubric-settings-file-input"
                accept="application/json,.json"
                required
              />
              {importModalWarning && (
                <div
                  key={importModalWarning}
                  class="alert alert-warning alert-dismissible fade show"
                  role="alert"
                >
                  {importModalWarning}
                  <button
                    type="button"
                    class="btn-close"
                    aria-label="Close"
                    onClick={() => setImportModalWarning(null)}
                  />
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <button type="button" class="btn btn-secondary" onClick={() => resetImportModal()}>
                Cancel
              </button>
              <button
                id="upload-rubric-file-button"
                type="button"
                class="btn btn-primary"
                onClick={() => importRubric()}
              >
                Upload file
              </button>
            </Modal.Footer>
          </Modal>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            data-bs-toggle="tooltip"
            data-bs-placement="bottom"
            data-bs-title="Imported rubric point values will be scaled to match the maximum points for this question."
          >
            <i class="fas fa-circle-info" />
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
          <button type="button" class="btn btn-secondary me-2" onClick={onCancel}>
            Discard changes
          </button>
          <button type="button" class="btn btn-primary" onClick={() => submitSettings(true)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function RubricRow({
  item,
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
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          style={{ cursor: 'grab' }}
          // @ts-expect-error See https://github.com/preactjs/preact-render-to-string/issues/429
          draggable="true"
          onDragStart={onDragStart}
        >
          <i class="fas fa-arrows-up-down" />
        </button>
        <button type="button" class="visually-hidden" aria-label="Move up" onClick={moveUp}>
          <i class="fas fa-arrow-up" />
        </button>
        <button type="button" class="visually-hidden" aria-label="Move down" onClick={moveDown}>
          <i class="fas fa-arrow-down" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost text-danger"
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
          style="width:5rem"
          step="any"
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
