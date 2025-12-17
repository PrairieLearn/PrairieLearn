import { useMemo, useRef, useState } from 'preact/hooks';
import { Modal, Overlay, Popover } from 'react-bootstrap';

import { downloadAsJSON } from '@prairielearn/browser-utils';

import type { AiGradingGeneralStats } from '../ee/lib/ai-grading/types.js';
import { b64EncodeUnicode } from '../lib/base64-util.js';
import type { StaffAssessmentQuestion } from '../lib/client/safe-db-types.js';
import type { RubricItem } from '../lib/db-types.js';
import type { RenderedRubricItem, RubricData } from '../lib/manualGrading.types.js';

type RubricItemData = Omit<RenderedRubricItem, 'rubric_item' | 'num_submissions'> & {
  rubric_item: Omit<RubricItem, 'rubric_id' | 'id' | 'number'> & { id?: string };
  disagreement_count: number | null;
  num_submissions: number | null;
};

/**
 * Explicitly declaring these functions from the window of the instance question page
 * so they can be called in the component.
 */
declare global {
  interface Window {
    resetInstructorGradingPanel: () => any;
    mathjaxTypeset: () => Promise<any>;
  }
}

export function RubricSettings({
  assessmentQuestion,
  rubricData,
  csrfToken,
  aiGradingStats,
  context,
}: {
  assessmentQuestion: StaffAssessmentQuestion;
  rubricData: RubricData | null;
  csrfToken: string;
  aiGradingStats: AiGradingGeneralStats | null;
  context: Record<string, any>;
}) {
  const showAiGradingStats = Boolean(aiGradingStats);
  const rubricItemsWithDisagreementCount = aiGradingStats?.rubric_stats ?? {};
  const rubricItemDataMerged =
    rubricData?.rubric_items.map((item) => ({
      ...item,
      disagreement_count:
        item.rubric_item.id in rubricItemsWithDisagreementCount
          ? rubricItemsWithDisagreementCount[item.rubric_item.id]
          : null,
    })) ?? [];
  const { variant_params, variant_true_answer, submission_submitted_answer } = context;
  const groups = {
    params: variant_params,
    correct_answers: variant_true_answer,
    submitted_answers: submission_submitted_answer,
  };
  const params = Object.entries(groups).flatMap(([groupName, groupParams]) => {
    return Object.keys(groupParams || {}).map((groupParam) => `{{${groupName}.${groupParam}}}`);
  });

  // Define states
  const [rubricItems, setRubricItems] = useState<RubricItemData[]>(rubricItemDataMerged);
  const [replaceAutoPoints, setReplaceAutoPoints] = useState<boolean>(
    rubricData?.rubric.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const [startingPoints, setStartingPoints] = useState<number>(
    rubricData?.rubric.starting_points ?? 0,
  );
  const [minPoints, setMinPoints] = useState<number>(rubricData?.rubric.min_points ?? 0);
  const [maxExtraPoints, setMaxExtraPoints] = useState<number>(
    rubricData?.rubric.max_extra_points ?? 0,
  );
  const [tagForGrading, setTagForGrading] = useState<boolean>(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importModalWarning, setImportModalWarning] = useState<string | null>(null);
  const rubricFile = useRef<HTMLInputElement>(null);
  const [wasUsingRubric, setWasUsingRubric] = useState<boolean>(Boolean(rubricData?.rubric));
  const [modifiedAt, setModifiedAt] = useState<Date | null>(rubricData?.rubric.modified_at ?? null);
  const [copyPopoverTarget, setCopyPopoverTarget] = useState<HTMLElement | null>(null);

  // Also define default for rubric-related variables
  const defaultRubricItems = useRef<RubricItemData[]>(rubricItemDataMerged);
  const defaultReplaceAutoPoints = useRef<boolean>(
    rubricData?.rubric.replace_auto_points ?? !assessmentQuestion.max_manual_points,
  );
  const defaultStartingPoints = useRef<number>(rubricData?.rubric.starting_points ?? 0);
  const defaultMinPoints = useRef<number>(rubricData?.rubric.min_points ?? 0);
  const defaultMaxExtraPoints = useRef<number>(rubricData?.rubric.max_extra_points ?? 0);

  // Derived totals/warnings
  const { totalPositive, totalNegative } = useMemo(() => {
    const [pos, neg] = rubricItems
      .map((item) => item.rubric_item.points)
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
        rubric_item: {
          always_show_to_students: true,
          deleted_at: null,
          description: '',
          explanation: null,
          grader_note: null,
          key_binding: null,
          points: 1,
        },
        num_submissions: null,
        disagreement_count: null,
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
      next[idx] = {
        ...next[idx],
        rubric_item: {
          ...next[idx].rubric_item,
          ...patch,
        },
      };
      return next;
    });
  };

  const onCancel = () => {
    setRubricItems(defaultRubricItems.current);
    setReplaceAutoPoints(defaultReplaceAutoPoints.current);
    setStartingPoints(defaultStartingPoints.current);
    setMinPoints(defaultMinPoints.current);
    setMaxExtraPoints(defaultMaxExtraPoints.current);
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
        points: it.rubric_item.points,
        description: it.rubric_item.description,
        explanation: it.rubric_item.explanation ?? '',
        grader_note: it.rubric_item.grader_note ?? '',
        always_show_to_students: it.rubric_item.always_show_to_students,
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
    setImportModalWarning(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
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
          rubric_item: {
            ...rubricItem,
            points: roundPoints((rubricItem.points ?? 0) * scaleFactor),
          }
        });
      }
      setRubricItems(scaledRubricItems);
      closeImportModal();
    } catch {
      setImportModalWarning('Error reading file content.');
    }
  };

  const copyMustachePattern = async (e: Event, param: string) => {
    const button = e.currentTarget as HTMLElement;
    await navigator.clipboard.writeText(param);
    button.animate(
      [
        { backgroundColor: '', color: '', offset: 0 },
        { backgroundColor: '#000', color: '#fff', offset: 0.5 },
        { backgroundColor: '', color: '', offset: 1 },
      ],
      500,
    );
    setCopyPopoverTarget(button);
    setTimeout(() => setCopyPopoverTarget(null), 1000);
  };

  const submitSettings = async (use_rubric: boolean) => {
    // Performs validation on the required inputs
    if (use_rubric) {
      const required = document.querySelectorAll<HTMLInputElement>(
        '#rubric-editor input[required]',
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
      modified_at: modifiedAt?.toISOString() ?? '',
      replace_auto_points: replaceAutoPoints,
      starting_points: startingPoints,
      min_points: minPoints,
      max_extra_points: maxExtraPoints,
      rubric_items: rubricItems.map((it, idx) => ({
        id: it.rubric_item.id,
        order: idx,
        points: it.rubric_item.points,
        description: it.rubric_item.description,
        explanation: it.rubric_item.explanation,
        grader_note: it.rubric_item.grader_note,
        always_show_to_students: it.rubric_item.always_show_to_students,
      })),
      tag_for_manual_grading: tagForGrading,
    };

    const res = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
    // Need to handle response separated for assessment question and instance question pages
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.gradingPanel) {
        const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
        if (!gradingPanel) return;

        const oldRubricForm = gradingPanel.querySelector<HTMLFormElement>(
          'form[name="manual-grading-form"]',
        );
        if (!oldRubricForm) return;

        // Save values in grading rubric so they can be re-applied once the form is re-created.
        const rubricFormData = Array.from(new FormData(oldRubricForm).entries());
        // The CSRF token of the returned panels is not valid for the current form (it uses a
        // different URL), so save the old value to be used in future requests.
        const oldCsrfToken =
          oldRubricForm.querySelector<HTMLInputElement>('[name=__csrf_token]')?.value ?? '';

        gradingPanel.innerHTML = data.gradingPanel;

        // Restore any values that had been set before the settings were configured.
        const newRubricForm = gradingPanel.querySelector<HTMLFormElement>(
          'form[name="manual-grading-form"]',
        );
        if (!newRubricForm) return;

        newRubricForm
          .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
          .forEach((input) => {
            input.checked = false;
          });
        rubricFormData.forEach(([item_name, item_value]) => {
          newRubricForm
            .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[name="${item_name}"]`)
            .forEach((input) => {
              if (input.name === 'modified_at') {
                // Do not reset modified_at, as the rubric settings may have changed it
              } else if (input.type !== 'checkbox' && !(item_value instanceof File)) {
                input.value = item_value;
              } else if (input instanceof HTMLInputElement && input.value === item_value) {
                input.checked = true;
              }
            });
        });
        document.querySelectorAll<HTMLInputElement>('input[name=__csrf_token]').forEach((input) => {
          input.value = oldCsrfToken;
        });
        window.resetInstructorGradingPanel();
        await window.mathjaxTypeset();
      }

      // Since we are preserving the temporary rubric item selection in the instance question page, the page is not refreshed
      // after saving. Suppose we start with setting A, and update it to B and save it. Ideally we would expect a "Discard changes"
      // to reset to B instead of A. We are updating the default values with B so "Discard changes" would reset correctly.
      const rubricData = data.rubric_data as RubricData | null;
      const rubric = rubricData?.rubric ?? null;
      const rubricItemsWithSelectionCount = rubricData?.rubric_items ?? [];
      const rubricItemsWithDisagreementCount = data.aiGradingStats?.rubric_stats ?? {};
      const rubricItemDataMerged = rubricItemsWithSelectionCount.map((item) => ({
        ...item,
        disagreement_count:
          item.rubric_item.id in rubricItemsWithDisagreementCount
            ? rubricItemsWithDisagreementCount[item.rubric_item.id]
            : null,
      }));

      defaultRubricItems.current = rubricItemDataMerged;
      defaultReplaceAutoPoints.current =
        rubric?.replace_auto_points ?? !assessmentQuestion.max_manual_points;
      defaultStartingPoints.current = rubric?.starting_points ?? 0;
      defaultMinPoints.current = rubric?.min_points ?? 0;
      defaultMaxExtraPoints.current = rubric?.max_extra_points ?? 0;
      setWasUsingRubric(Boolean(rubric));
      setModifiedAt(rubric ? new Date(rubric.modified_at) : null);
      onCancel();
    } else {
      window.location.replace(res.url);
    }
  };

  return (
    <div id="rubric-editor" class="card overflow-hidden mb-3">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="modify_rubric_settings" />
      <input type="hidden" name="modified_at" value={modifiedAt?.toISOString() ?? ''} />
      <input type="hidden" name="starting_points" value={startingPoints} />
      <input type="hidden" name="max_extra_points" value={maxExtraPoints} />
      <input type="hidden" name="min_points" value={minPoints} />
      <div class="card-header collapsible-card-header d-flex align-items-center">
        <h2>Rubric settings</h2>
        <button
          type="button"
          class="expand-icon-container btn btn-secondary btn-sm text-nowrap ms-auto collapsed"
          data-bs-toggle="collapse"
          data-bs-target="#rubric-setting"
          aria-expanded="false"
          aria-controls="rubric-setting"
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
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      data-bs-toggle="tooltip"
                      data-bs-placement="bottom"
                      data-bs-title="If the rubric is applied to manual points only, then a student's auto points are kept, and the rubric items will be added to (or subtracted from) the autograder results."
                    >
                      <i class="fas fa-circle-info" />
                    </button>
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
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      data-bs-toggle="tooltip"
                      data-bs-placement="bottom"
                      data-bs-title={`If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${assessmentQuestion.max_points} points).`}
                    >
                      <i class="fas fa-circle-info" />
                    </button>
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
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="This setting only affects starting points. Rubric items may always be added with positive or negative points."
                >
                  <i class="fas fa-circle-info" />
                </button>
              </div>
            </div>

            <div class="mb-3 col-6 col-lg-3">
              <label class="form-label">
                Minimum rubric score
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="By default, penalties applied by rubric items cannot cause the rubric to have negative points. This value overrides this limit, e.g., for penalties that affect auto points or the assessment as a whole."
                >
                  <i class="fas fa-circle-info" />
                </button>
                <input
                  class="form-control"
                  type="number"
                  value={minPoints}
                  onInput={(e) => setMinPoints(Number(e.currentTarget.value))}
                />
              </label>
            </div>
            <div class="mb-3 col-6 col-lg-3">
              <label class="form-label">
                Maximum extra credit
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="By default, points are limited to the maximum points assigned to the question, and credit assigned by rubric items do not violate this limit. This value allows rubric points to extend beyond this limit, e.g., for bonus credit."
                >
                  <i class="fas fa-circle-info" />
                </button>
                <input
                  class="form-control"
                  type="number"
                  value={maxExtraPoints}
                  onInput={(e) => setMaxExtraPoints(Number(e.currentTarget.value))}
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
                    key={it.rubric_item.id ?? `row-${idx}`}
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
          <Modal
            show={showImportModal}
            size="lg"
            onHide={closeImportModal}
            onExited={resetImportModal}
          >
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
              <button type="button" class="btn btn-secondary" onClick={closeImportModal}>
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
        {params.length > 0 && (
          <div class="small form-text text-muted">
            Rubric items may use these entries, which are replaced with the corresponding values for
            the student variant (click to copy):
            <ul style="max-height: 7rem; overflow-y: auto;">
              {params.map((param) => (
                <li key={`${param}`}>
                  <button
                    type="button"
                    class="btn btn-sm"
                    onClick={(e) => copyMustachePattern(e, param)}
                  >
                    <code>{param}</code>
                  </button>
                </li>
              ))}
              {copyPopoverTarget && (
                <Overlay target={copyPopoverTarget} placement="right" show>
                  {(props) => (
                    <Popover {...props}>
                      <Popover.Body>Copied!</Popover.Body>
                    </Popover>
                  )}
                </Overlay>
              )}
            </ul>
          </div>
        )}
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
        <div class="form-check">
          <label class="form-check-label">
            <input
              class="form-check-input"
              type="checkbox"
              checked={tagForGrading}
              onChange={() => setTagForGrading(!tagForGrading)}
            />
            Require all graded submissions to be manually graded/reviewed
          </label>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            data-bs-toggle="tooltip"
            data-bs-placement="bottom"
            data-bs-title="Changes in rubric item values update the points for all previously graded submissions. If this option is selected, these submissions will also be tagged for manual grading, requiring a review by a grader."
          >
            <i class="fas fa-circle-info" />
          </button>
        </div>
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

function RubricRow({
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
        {item.rubric_item.id && (
          <>
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][id]`}
              value={item.rubric_item.id}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][points]`}
              value={item.rubric_item.points}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][description]`}
              value={item.rubric_item.description}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][explanation]`}
              value={b64EncodeUnicode(item.rubric_item.explanation ?? '')}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][grader_note]`}
              value={b64EncodeUnicode(item.rubric_item.grader_note ?? '')}
            />
            <input
              type="hidden"
              name={`rubric_item[${item.rubric_item.id}][always_show_to_students]`}
              value={item.rubric_item.always_show_to_students ? 'true' : 'false'}
            />
          </>
        )}
      </td>

      <td class="align-middle">
        <input
          type="number"
          class="form-control"
          style="width:5rem"
          step="any"
          value={item.rubric_item.points}
          aria-label="Points"
          required
          onInput={(e) => updateRubricItem({ points: Number(e.currentTarget.value) })}
        />
      </td>

      <td class="align-middle">
        <input
          type="text"
          class="form-control"
          maxLength={100}
          style="min-width:15rem"
          value={item.rubric_item.description}
          aria-label="Description"
          required
          onInput={(e) => updateRubricItem({ description: e.currentTarget.value })}
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          /**
           * In one of the previous versions, explanation wasn't displayed correctly
           * when used this way. We fixed it by making the textarea uncontrolled and
           * putting the explanation text in the body of the textarea element.
           * However, this method will not work well with "Discard changes".
           * Ditto for grader note below.
           */
          value={item.rubric_item.explanation ?? ''}
          maxLength={10000}
          style="min-width:15rem"
          aria-label="Explanation"
          onInput={(e) => updateRubricItem({ explanation: e.currentTarget.value })}
        />
      </td>

      <td class="align-middle">
        <textarea
          class="form-control"
          value={item.rubric_item.grader_note ?? ''}
          maxLength={10000}
          style="min-width:15rem"
          aria-label="Grader note"
          onInput={(e) => updateRubricItem({ grader_note: e.currentTarget.value })}
        />
      </td>

      <td class="align-middle">
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input"
              checked={item.rubric_item.always_show_to_students}
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
              checked={!item.rubric_item.always_show_to_students}
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
