import { signal } from '@preact/signals';
import { Dropdown, Modal } from 'bootstrap';
import { Fragment, render } from 'preact';
import React, { useEffect, useState } from 'preact/hooks';

import { decodeData, onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { SyncProblemButton } from '../../src/components/SyncProblemButton.html.js';
import {
  type AssessmentAlternativeQuestion,
  type AssessmentQuestionRow,
  type Zone,
} from '../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  const assessmentQuestionsTable = document.querySelector(
    '.js-assessment-questions-table',
  ) as HTMLElement;
  const assessmentType = assessmentQuestionsTable.dataset.assessmentType ?? '';
  const urlPrefix = assessmentQuestionsTable.dataset.urlPrefix ?? '';
  const assessmentInstanceId = assessmentQuestionsTable.dataset.assessmentInstanceId ?? '';
  const hasCoursePermissionPreview =
    assessmentQuestionsTable.dataset.hasCoursePermissionPreview === 'true';
  const hasCourseInstancePermissionEdit =
    assessmentQuestionsTable.dataset.hasCourseInstancePermissionEdit === 'true';
  const questionsData = decodeData('assessment-questions-data');
  const editMode = signal(false);
  const editedQuestion = signal<AssessmentQuestionRow | null>(null);
  const editedZone = signal<Zone | null>(null);
  const editModal = document.querySelector('.js-edit-modal') as HTMLElement;

  const zones: Zone[] = [];
  let currentZone: Zone = {
    title: null,
    maxPoints: null,
    numberChoose: null,
    bestQuestions: null,
    questions: [],
    advanceScorePerc: null,
    gradeRateMinutes: null,
  };
  questionsData.map((question: AssessmentQuestionRow, i: number) => {
    if (question.start_new_zone && i !== 0) {
      zones.push(currentZone);
    }
    if (question.start_new_zone) {
      currentZone = {
        title: question.zone_title ?? null,
        maxPoints: question.zone_max_points ?? null,
        numberChoose: question.zone_number_choose ?? null,
        bestQuestions: question.zone_best_questions ?? null,
        questions: [],
        advanceScorePerc: question.assessment_question_advance_score_perc ?? null,
        gradeRateMinutes: question.grade_rate_minutes ?? null,
      };
    }
    if (question.alternative_group_size === 1) {
      currentZone.questions?.push(question);
    } else if (question.start_new_alternative_group) {
      currentZone.questions?.push({
        ...question,
        alternatives: [question],
      });
    } else {
      if (currentZone.questions) {
        currentZone.questions[currentZone.questions.length - 1].alternatives?.push(question);
      }
    }
  });
  zones.push(currentZone);
  const resolvedZones = signal(zones);

  function EditModeButtons() {
    return (
      <div class="ms-auto">
        {!editMode.value ? (
          <button
            class="btn btn-sm btn-light"
            type="button"
            onClick={() => (editMode.value = true)}
          >
            <i class="fa fa-edit" aria-hidden="true"></i> Edit assessment questions
          </button>
        ) : (
          <span class="js-edit-mode-buttons">
            <button class="btn btn-sm btn-light mx-1" type="button" onClick={() => handleSave()}>
              <i class="fa fa-save" aria-hidden="true"></i> Save and sync
            </button>
            <button
              class="btn btn-sm btn-light"
              type="button"
              onClick={() => window.location.reload()}
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    );
  }

  render(<EditModeButtons />, document.querySelector('.js-edit-mode-buttons') as HTMLElement);

  function AssessmentQuestionsTable() {
    // If at least one question has a nonzero unlock score, display the Advance Score column
    const showAdvanceScorePercCol =
      questionsData.filter(
        (q: AssessmentQuestionRow) => q.assessment_question_advance_score_perc !== 0,
      ).length >= 1;

    const nTableCols = showAdvanceScorePercCol ? 12 : 11;

    function maxPoints({
      max_auto_points,
      max_manual_points,
      auto_points_list,
      init_points,
    }: {
      max_auto_points: number;
      max_manual_points: number;
      auto_points_list: number[];
      init_points: number;
    }) {
      if (max_auto_points || !max_manual_points) {
        if (assessmentType === 'Exam') {
          return auto_points_list.join(',');
        }
        if (assessmentType === 'Homework') {
          return `${init_points - max_manual_points}/${max_auto_points}`;
        }
      } else {
        return '—';
      }
    }

    const handleEditZone = ({ zone, zoneIndex }: { zone: Zone; zoneIndex: number }) => {
      editedZone.value = { ...zone };
      render(<EditZoneModal zone={zone} zoneIndex={zoneIndex} />, editModal);
      Modal.getOrCreateInstance(editModal).show();
    };

    const handleEditQuestion = ({
      question,
      zoneIndex,
      questionIndex,
      alternativeGroupIndex,
    }: {
      question: AssessmentQuestionRow;
      zoneIndex: number;
      questionIndex: number;
      alternativeGroupIndex?: number;
    }) => {
      editedQuestion.value = { ...question };
      render(
        <EditQuestionModal
          question={question}
          zoneIndex={zoneIndex}
          questionIndex={questionIndex}
          alternativeGroupIndex={alternativeGroupIndex ?? undefined}
        />,
        editModal,
      );
      Modal.getOrCreateInstance(editModal).show();
    };

    const handleDeleteQuestion = ({
      zoneIndex,
      questionIndex,
      alternativeGroupIndex,
    }: {
      zoneIndex: number;
      questionIndex: number;
      alternativeGroupIndex?: number;
    }) => {
      render(
        <DeleteQuestionModal
          zoneIndex={zoneIndex}
          questionIndex={questionIndex}
          alternativeGroupIndex={alternativeGroupIndex}
        />,
        editModal,
      );
      Modal.getOrCreateInstance(editModal).show();
    };

    const handleAddQuestion = (zoneIndex: number) => {
      const update = resolvedZones.value.map((z) => ({ ...z }));
      update[zoneIndex].questions.push(newQuestion);
      resolvedZones.value = [...update];
      render(
        <EditQuestionModal
          question={newQuestion}
          zoneIndex={zoneIndex}
          questionIndex={resolvedZones.value[zoneIndex].questions.length - 1}
        />,
        editModal,
      );
      Modal.getOrCreateInstance(editModal).show();
    };

    function handleSwapZones({
      zoneIndex,
      targetZoneIndex,
    }: {
      zoneIndex: number;
      targetZoneIndex: number;
    }) {
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      const zone = update[zoneIndex];
      update[zoneIndex] = update[targetZoneIndex];
      update[targetZoneIndex] = zone;
      resolvedZones.value = [...update];
    }

    function swapQuestions({
      zoneIndex,
      questionIndex,
      targetQuestionIndex,
    }: {
      zoneIndex: number;
      questionIndex: number;
      targetQuestionIndex: number;
    }) {
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      const question = update[zoneIndex].questions[questionIndex];
      update[zoneIndex].questions[questionIndex] = update[zoneIndex].questions[targetQuestionIndex];
      update[zoneIndex].questions[targetQuestionIndex] = question;
      resolvedZones.value = [...update];
    }

    const handleMoveQuestionUp = ({
      zoneIndex,
      questionIndex,
      alternativeGroupIndex,
    }: {
      zoneIndex: number;
      questionIndex: number;
      alternativeGroupIndex?: number;
    }) => {
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      const question = update[zoneIndex].questions[questionIndex];
      if (
        zoneIndex === 0 &&
        questionIndex === 0 &&
        (alternativeGroupIndex === null || alternativeGroupIndex === 0)
      ) {
        return;
      }
      // Determine if the question is in an alternative group.
      if (typeof alternativeGroupIndex === 'number') {
        const alternatives = question.alternatives;
        if (!alternatives) return;
        // If the question is in an alternative group and the alternative is the first alternative
        // in the group, we need to move the question out of the group.
        if (alternativeGroupIndex === 0) {
          if (question.alternatives) {
            question.alternatives[alternativeGroupIndex].alternative_group_size = 1;
          }
          update[zoneIndex].questions.splice(
            questionIndex,
            0,
            alternatives.shift() ?? update[zoneIndex].questions[0],
          );
          resolvedZones.value = [...update];
          return;
          // else we need to swap the question with the question above it in the alternative group.
        } else {
          const question = alternatives[alternativeGroupIndex];
          alternatives[alternativeGroupIndex] = alternatives[alternativeGroupIndex - 1];
          alternatives[alternativeGroupIndex - 1] = question;
          resolvedZones.value = [...update];
          return;
        }
      }
      // If the question is the first question in the zone, we need to shift it out of the current
      // zone and push it to the end of the previous zone.
      if (questionIndex === 0) {
        update[zoneIndex - 1].questions.push(
          update[zoneIndex].questions.shift() ?? update[zoneIndex].questions[0],
        );
        resolvedZones.value = [...update];
        return;
      }

      // If the question above is in an alternative group, we need to move the question into the
      // group.
      if (update[zoneIndex].questions[questionIndex - 1].alternatives) {
        update[zoneIndex].questions[questionIndex - 1].alternatives?.push(question);
        update[zoneIndex].questions.splice(questionIndex, 1);
        resolvedZones.value = [...update];
        return;
      }

      // If a question is not the first in its zone and the question above is not in an
      // alternative group, we can simply swap it with the one above it.
      swapQuestions({
        zoneIndex,
        questionIndex,
        targetQuestionIndex: questionIndex - 1,
      });
    };

    const handleMoveQuestionDown = ({
      zoneIndex,
      questionIndex,
      alternativeGroupIndex,
    }: {
      zoneIndex: number;
      questionIndex: number;
      alternativeGroupIndex?: number;
    }) => {
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      const question = update[zoneIndex].questions[questionIndex];
      if (
        zoneIndex === resolvedZones.value.length - 1 &&
        questionIndex === resolvedZones.value[zoneIndex].questions.length - 1 &&
        (!resolvedZones.value[zoneIndex].questions[questionIndex].alternatives ||
          alternativeGroupIndex ===
            resolvedZones.value[zoneIndex].questions[questionIndex].alternatives?.length - 1)
      ) {
        return;
      }
      // Determine if the question is in an alternative group.
      if (typeof alternativeGroupIndex === 'number') {
        const alternatives = question.alternatives;
        if (!alternatives) return;
        // If the question is in an alternative group and the alternative is the last alternative in
        // the group, we need to move the question out of the group.
        if (alternativeGroupIndex === alternatives.length - 1) {
          if (question.alternatives) {
            question.alternatives[alternativeGroupIndex].alternative_group_size = 1;
          }
          update[zoneIndex].questions.splice(
            questionIndex + 1,
            0,
            alternatives.pop() ?? update[zoneIndex].questions[0],
          );
          resolvedZones.value = [...update];
          return;
          // else we need to swap the question with the question below it in the alternative group.
        } else {
          const question = alternatives[alternativeGroupIndex];
          alternatives[alternativeGroupIndex] = alternatives[alternativeGroupIndex + 1];
          alternatives[alternativeGroupIndex + 1] = question;
          resolvedZones.value = [...update];
          return;
        }
      }
      // If the question is the last question in the zone, we need to move it to the
      // beginning of the next zone.
      if (questionIndex === update[zoneIndex].questions.length - 1) {
        update[zoneIndex + 1].questions.unshift(update[zoneIndex].questions.pop() ?? question);
        resolvedZones.value = [...update];
        return;
      }
      // If the question below is in an alternative group, we need to move the question into the
      // group.
      if (update[zoneIndex].questions[questionIndex + 1].alternatives) {
        update[zoneIndex].questions[questionIndex + 1].alternatives?.unshift(question);
        update[zoneIndex].questions.splice(questionIndex, 1);
        resolvedZones.value = [...update];
        return;
      }
      // If a question is not the last in its zone and the question below is not in an alternative
      // group, we can simply swap it with the one below it.
      swapQuestions({
        zoneIndex,
        questionIndex,
        targetQuestionIndex: questionIndex + 1,
      });
    };

    let questionNumber = 0;
    const questionRow = ({
      question,
      zoneIndex,
      questionIndex,
      alternativeGroupIndex,
    }: {
      question: AssessmentQuestionRow | AssessmentAlternativeQuestion;
      zoneIndex: number;
      questionIndex: number;
      alternativeGroupIndex?: number;
    }) => {
      return (
        <tr>
          {editMode.value ? (
            <>
              {question.alternative_group_size > 1 ? <td></td> : ''}
              <td></td>
              <td class="align-content-center">
                <div>
                  <button
                    class="btn btn-xs btn-secondary"
                    type="button"
                    disabled={
                      zoneIndex === 0 &&
                      questionIndex === 0 &&
                      (!alternativeGroupIndex || alternativeGroupIndex === 0)
                    }
                    onClick={() =>
                      handleMoveQuestionUp({ zoneIndex, questionIndex, alternativeGroupIndex })
                    }
                  >
                    <i class="fa fa-arrow-up" aria-hidden="true"></i>
                  </button>
                </div>
                <div>
                  <button
                    class="btn btn-xs btn-secondary"
                    type="button"
                    disabled={
                      zoneIndex === resolvedZones.value.length - 1 &&
                      questionIndex === resolvedZones.value[zoneIndex].questions.length - 1 &&
                      (!resolvedZones.value[zoneIndex].questions[questionIndex].alternatives ||
                        alternativeGroupIndex ===
                          resolvedZones.value[zoneIndex].questions[questionIndex].alternatives
                            ?.length -
                            1)
                    }
                    onClick={() =>
                      handleMoveQuestionDown({ zoneIndex, questionIndex, alternativeGroupIndex })
                    }
                  >
                    <i class="fa fa-arrow-down" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
              <td class="align-content-center">
                <button
                  class="btn btn-sm btn-secondary"
                  type="button"
                  onClick={() =>
                    handleEditQuestion({
                      question,
                      zoneIndex,
                      questionIndex,
                      alternativeGroupIndex,
                    })
                  }
                >
                  <i class="fa fa-edit" aria-hidden="true"></i>
                </button>
              </td>
              <td class="align-content-center">
                <button
                  class="btn btn-sm btn-danger"
                  type="button"
                  onClick={() =>
                    handleDeleteQuestion({
                      zoneIndex,
                      questionIndex,
                      alternativeGroupIndex,
                    })
                  }
                >
                  <i class="fa fa-trash" aria-hidden="true"></i>
                </button>
              </td>
            </>
          ) : (
            ''
          )}
          <td class="align-content-center">
            {hasCoursePermissionPreview ? (
              <>
                <a href={`${urlPrefix}/question/${question.question_id}/`}>
                  {questionNumber}.
                  {alternativeGroupIndex || alternativeGroupIndex === 0
                    ? `${alternativeGroupIndex + 1} `
                    : ' '}
                  {question.title}
                </a>{' '}
                {question.open_issue_count ? (
                  <a
                    class="badge badge-pill badge-danger"
                    href={`${urlPrefix}/course_admin/issues${
                      question.qid ? `?q=is%3Aopen+qid%3A${encodeURIComponent(question.qid)}` : ''
                    }`}
                    aria-label={`${question.open_issue_count} open ${question.open_issue_count === 1 ? 'issue' : 'issues'}`}
                  >
                    {question.open_issue_count ?? 0}
                  </a>
                ) : (
                  ''
                )}
              </>
            ) : (
              <>
                {questionNumber}.{' '}
                {alternativeGroupIndex || alternativeGroupIndex === 0
                  ? `${alternativeGroupIndex + 1} `
                  : ' '}
                {question.title}
              </>
            )}
          </td>
          <td class="align-content-center">
            {question.sync_errors
              ? SyncProblemButton({
                  type: 'error',
                  output: question.sync_errors,
                })
              : question.sync_warnings
                ? SyncProblemButton({
                    type: 'warning',
                    output: question.sync_warnings,
                  })
                : ''}
            {question.display_name}
          </td>
          <td>
            <span class={`badge color-${question.topic?.color}`}>{question.topic?.name}</span>
          </td>
          <td>
            {question.tags?.map((tag) => {
              return (
                <span class={`badge color-${tag.color} me-1`} key={tag.id}>
                  {tag.name}
                </span>
              );
            })}
          </td>
          <td>
            {maxPoints({
              max_auto_points: question.max_auto_points ?? 0,
              max_manual_points: question.max_manual_points ?? 0,
              auto_points_list: question.auto_points_list ?? [],
              init_points: question.init_points ?? 0,
            })}
          </td>
          <td>{question.max_manual_points || '—'}</td>
          {showAdvanceScorePercCol ? (
            <td
              class={question.assessment_question_advance_score_perc === 0 ? 'text-muted' : ''}
              data-testid="advance-score-perc"
            >
              {question.assessment_question_advance_score_perc}%
            </td>
          ) : (
            ''
          )}
          <td>
            {question.mean_question_score ? `${question.mean_question_score.toFixed(3)}%` : ''}
          </td>
          <td class="text-center">
            {question.number_submissions_hist ? (
              <div
                class="js-histmini"
                data-data={`${JSON.stringify(question.number_submissions_hist)}`}
                data-options={`${JSON.stringify({ width: 60, height: 20 })}`}
              ></div>
            ) : (
              ''
            )}
          </td>
          <td>
            {question.other_assessments?.map((assessment) => {
              return (
                <a
                  href={`${urlPrefix}/assessment/${assessment.assessment_id}`}
                  class={`btn btn-badge color-${assessment.color} me-1`}
                  key={assessment.assessment_id}
                >
                  {assessment.label}
                </a>
              );
            })}
          </td>
          <td class="text-right">
            <div class="dropdown js-question-actions">
              <button
                type="button"
                class="btn btn-secondary btn-xs dropdown-toggle"
                data-bs-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
                onClick={(e) => {
                  Dropdown.getOrCreateInstance(e.target as HTMLElement).toggle();
                }}
              >
                Action <span class="caret"></span>
              </button>
              <div class="dropdown-menu">
                {hasCourseInstancePermissionEdit ? (
                  <button
                    class="dropdown-item"
                    type="button"
                    data-bs-toggle="modal"
                    data-bs-target="#resetQuestionVariantsModal"
                    data-assessment-question-id={question.id}
                  >
                    Reset question variants
                  </button>
                ) : (
                  <button class="dropdown-item disabled" type="button" disabled>
                    Must have editor permission
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      );
    };

    const zoneRowMap = resolvedZones.value.map((zone, zoneIndex) => {
      return (
        // We must use explicit <Fragement> syntax to include keys.
        <Fragment key={`zone-${zoneIndex}`}>
          <tr>
            {editMode.value ? (
              <>
                <td class="align-content-center">
                  <div>
                    <button
                      class="btn btn-xs btn-secondary"
                      type="button"
                      disabled={zoneIndex === 0}
                      onClick={() => handleSwapZones({ zoneIndex, targetZoneIndex: zoneIndex - 1 })}
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary"
                      type="button"
                      disabled={zoneIndex === resolvedZones.value.length - 1}
                      onClick={() => handleSwapZones({ zoneIndex, targetZoneIndex: zoneIndex + 1 })}
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                  </div>
                </td>
                <td class="align-content-center">
                  <button
                    class="btn btn-sm btn-secondary"
                    type="button"
                    onClick={() => handleEditZone({ zone, zoneIndex })}
                  >
                    <i class="fa fa-edit" aria-hidden="true"></i>
                  </button>
                </td>
              </>
            ) : (
              ''
            )}
            <th colspan={editMode.value ? nTableCols + 1 : nTableCols} class="align-content-center">
              Zone {zoneIndex + 1}. {zone.title}
              {zone.numberChoose == null
                ? '(Choose all questions)'
                : zone.numberChoose === 1
                  ? '(Choose 1 question)'
                  : `(Choose ${zone.numberChoose} questions)`}
              {zone.maxPoints ? `(maximum ${zone.maxPoints} points)` : ''}
              {zone.bestQuestions ? `(best ${zone.bestQuestions} questions)` : ''}
            </th>
          </tr>
          {zone.questions?.map((question, questionIndex) => {
            questionNumber++;
            question.alternative_group_size = question.alternatives
              ? question.alternatives.length
              : 1;
            return (
              <Fragment key={`question-${zoneIndex}-${questionIndex}`}>
                {question.start_new_alternative_group && question.alternative_group_size > 1 ? (
                  <tr>
                    {editMode ? <td></td> : ''}
                    <td colspan={nTableCols - 1}>
                      {questionNumber}.
                      {question.alternative_group_number_choose == null
                        ? ' Choose all questions from:'
                        : question.alternative_group_number_choose === 1
                          ? ' Choose 1 question from:'
                          : ` Choose ${question.alternative_group_number_choose} questions from:`}
                    </td>
                  </tr>
                ) : (
                  ''
                )}
                {question.alternative_group_size > 1
                  ? question.alternatives?.map(
                      (
                        alternativeQuestion: AssessmentAlternativeQuestion,
                        alternativeGroupIndex,
                      ) => {
                        alternativeQuestion.alternative_group_size =
                          question.alternative_group_size;
                        return questionRow({
                          question: alternativeQuestion,
                          zoneIndex,
                          questionIndex,
                          alternativeGroupIndex,
                        });
                      },
                    )
                  : questionRow({ question, zoneIndex, questionIndex })}
              </Fragment>
            );
          })}
          {editMode.value ? (
            <tr>
              <td></td>
              <td colspan={nTableCols - 1}>
                <button
                  class="btn btn-sm"
                  type="button"
                  onClick={() => handleAddQuestion(zoneIndex)}
                >
                  <i class="fa fa-add" aria-hidden="true"></i> Add Question to Zone
                </button>
              </td>
            </tr>
          ) : (
            ''
          )}
        </Fragment>
      );
    });

    return (
      <table class="table table-sm table-hover" aria-label="Assessment questions">
        <thead>
          <tr>
            {editMode.value ? <th colSpan={4}></th> : ''}
            <th>
              <span class="visually-hidden">Name</span>
            </th>
            <th>QID</th>
            <th>Topic</th>
            <th>Tags</th>
            <th>Auto Points</th>
            <th>Manual Points</th>
            {showAdvanceScorePercCol ? <th>Advance Score</th> : ''}
            <th>Mean score</th>
            <th>Num. Submissions Histogram</th>
            <th>Other Assessments</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>{zoneRowMap}</tbody>
      </table>
    );
  }
  render(<AssessmentQuestionsTable />, assessmentQuestionsTable);

  function EditZoneModal({ zone, zoneIndex }: { zone: Zone; zoneIndex: number }) {
    const handleSubmit = () => {
      Modal.getOrCreateInstance(editModal).hide();
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      update[zoneIndex] = editedZone.value ?? update[zoneIndex];
      resolvedZones.value = [...update];
    };
    return (
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4">Edit Zone</h2>
            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body">
            <form id="edit-zone-form">
              <div class="mb-3">
                <label for="zoneTitleInput">Title</label>
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control"
                    id="zoneTitleInput"
                    name="zoneTitle"
                    aria-describedby="zoneTitleHelp"
                    value={zone.title ?? ''}
                    onChange={(e) => {
                      if (editedZone.value) {
                        editedZone.value.title = (e.target as HTMLInputElement).value;
                      }
                    }}
                  />
                </div>
                <small id="zoneNameHelp" class="form-text text-muted">
                  {' '}
                  The name of the zone.{' '}
                </small>
              </div>
              <div class="mb-3">
                <label for="bestQuestionsInput">Best Questions</label>
                <div class="input-group">
                  <input
                    type="number"
                    class="form-control"
                    id="bestQuestionsInput"
                    name="bestQuestions"
                    aria-describedby="bestQuestionsHelp"
                    value={zone.bestQuestions ?? ''}
                    onChange={(e) => {
                      if (editedZone.value) {
                        if ((e.target as HTMLInputElement).value === '') {
                          editedZone.value.bestQuestions = null;
                        } else {
                          editedZone.value.bestQuestions = (
                            e.target as HTMLInputElement
                          ).valueAsNumber;
                        }
                      }
                    }}
                  />
                </div>
                <small id="bestQuestionsHelp" class="form-text text-muted">
                  Number of questions with the highest number of awarded points will count towards
                  the total. Leave blank to allow points from all questions.
                </small>
              </div>
              <div class="mb-3">
                <label for="numberChooseInput">Number Choose</label>
                <div class="input-group">
                  <input
                    type="number"
                    class="form-control"
                    id="numberChooseInput"
                    name="numberChoose"
                    aria-describedby="numberChooseHelp"
                    value={zone.numberChoose ?? ''}
                    onChange={(e) => {
                      if (editedZone.value) {
                        if ((e.target as HTMLInputElement).value === '') {
                          editedZone.value.numberChoose = null;
                        } else {
                          editedZone.value.numberChoose = (
                            e.target as HTMLInputElement
                          ).valueAsNumber;
                        }
                      }
                    }}
                  />
                </div>
                <small id="bestQuestionsHelp" class="form-text text-muted">
                  Number of questions the student can choose from. Leave blank for all questions.
                </small>
              </div>
              <div class="mb-3">
                <label for="maxPointsInput">Max Points</label>
                <div class="input-group">
                  <input
                    type="number"
                    class="form-control"
                    id="maxPointsInput"
                    name="maxPoints"
                    aria-describedby="maxPointsHelp"
                    value={zone.maxPoints ?? ''}
                    onChange={(e) => {
                      if (editedZone.value) {
                        if ((e.target as HTMLInputElement).value === '') {
                          editedZone.value.maxPoints = null;
                        }
                        editedZone.value.maxPoints = (e.target as HTMLInputElement).valueAsNumber;
                      }
                    }}
                  />
                </div>
                <small id="maxPointssHelp" class="form-text text-muted">
                  Only this many of the points that are awarded for answering questions in this zone
                  will count toward the total points.
                </small>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Close
            </button>
            <button type="button" class="btn btn-primary" onClick={() => handleSubmit()}>
              Save changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  function EditQuestionModal({
    question,
    zoneIndex,
    questionIndex,
    alternativeGroupIndex,
  }: {
    question: AssessmentQuestionRow;
    zoneIndex: number;
    questionIndex: number;
    alternativeGroupIndex?: number;
  }) {
    const [autoGraded, setAutoGraded] = useState(question.max_manual_points === 0);
    const handleSubmit = () => {
      Modal.getOrCreateInstance(editModal).hide();
      const update: Zone[] = resolvedZones.value.map((z) => ({ ...z }));
      if (update[zoneIndex].questions) {
        if (alternativeGroupIndex && update[zoneIndex].questions[questionIndex].alternatives) {
          update[zoneIndex].questions[questionIndex].alternatives[alternativeGroupIndex] =
            editedQuestion.value ??
            update[zoneIndex].questions[questionIndex].alternatives[alternativeGroupIndex];
        } else {
          update[zoneIndex].questions[questionIndex] =
            editedQuestion.value ?? update[zoneIndex].questions[questionIndex];
        }
      }
      resolvedZones.value = [...update];
    };
    useEffect(() => {
      setAutoGraded(question.max_manual_points === 0);
    }, [question]);
    return (
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4">Edit Question</h2>
            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body">
            <form id="edit-question-form">
              <div class="mb-3">
                <label for="qidInput">QID</label>
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control"
                    id="qidInput"
                    name="qid"
                    aria-describedby="qidHelp"
                    value={editedQuestion.value?.qid ?? ''}
                    onChange={(e) => {
                      if (editedQuestion.value) {
                        editedQuestion.value.qid = (e.target as HTMLInputElement).value;
                        editedQuestion.value.display_name = (e.target as HTMLInputElement).value;
                      }
                    }}
                  />
                </div>
                <small id="uidHelp" class="form-text text-muted">
                  {' '}
                  This is the unique question ID.{' '}
                </small>
              </div>
              {assessmentType === 'Homework' ? (
                <>
                  <div class="mb-3">
                    <label for="gradingMethod" class="form-label">
                      Grading Method
                    </label>
                    <select
                      class="form-control"
                      id="gradingMethod"
                      name="gradingMethod"
                      onChange={(e) =>
                        setAutoGraded((e.target as HTMLSelectElement)?.value === 'auto')
                      }
                    >
                      <option value="auto" selected={autoGraded}>
                        Auto
                      </option>
                      <option value="manual" selected={!autoGraded}>
                        Manual
                      </option>
                    </select>
                    <small id="gradingMethodHelp" class="form-text text-muted">
                      Whether points for the question will be given automatically or manually.
                    </small>
                  </div>
                  {autoGraded ? (
                    <>
                      <div class="mb-3">
                        <label for="autoPointsInput">Auto Points</label>
                        <input
                          type="number"
                          class="form-control"
                          id="autoPointsInput"
                          name="autoPoints"
                          value={editedQuestion.value?.init_points ?? 0}
                          onChange={(e) => {
                            if (editedQuestion.value) {
                              editedQuestion.value.init_points = (
                                e.target as HTMLInputElement
                              ).valueAsNumber;
                            }
                          }}
                        />
                        <small id="autoPointsHelp" class="form-text text-muted">
                          The amount of points each attempt at the question is worth.
                        </small>
                      </div>
                      <div class="mb-3">
                        <label for="maxAutoPointsInput">Max Points</label>
                        <input
                          type="number"
                          class="form-control"
                          id="maxAutoPointsInput"
                          name="maxAutoPoints"
                          value={editedQuestion.value?.max_auto_points ?? 0}
                          onChange={(e) => {
                            if (editedQuestion.value) {
                              editedQuestion.value.max_auto_points = (
                                e.target as HTMLInputElement
                              ).valueAsNumber;
                            }
                          }}
                        />
                        <small id="maxPointsHelp" class="form-text text-muted">
                          The maximum number of points that can be awarded for the question.
                        </small>
                      </div>
                      <div class="mb-3">
                        <label for="triesPerVariantInput">Tries Per Variant</label>
                        <input
                          type="number"
                          class="form-control"
                          id="triesPerVariantInput"
                          name="triesPerVariant"
                          value={editedQuestion.value?.tries_per_variant ?? 0}
                          onChange={(e) => {
                            if (editedQuestion.value) {
                              editedQuestion.value.tries_per_variant = (
                                e.target as HTMLInputElement
                              ).valueAsNumber;
                            }
                          }}
                        />
                        <small id="triesPerVariantHelp" class="form-text text-muted">
                          This is the number of attempts a student has to answer the question before
                          getting a new variant.
                        </small>
                      </div>
                    </>
                  ) : (
                    <div class="mb-3">
                      <label for="manualPointsInput">Manual Points</label>
                      <input
                        type="number"
                        class="form-control"
                        id="manualPointsInput"
                        name="manualPoints"
                        value={editedQuestion.value?.max_manual_points ?? 0}
                        onChange={(e) => {
                          if (editedQuestion.value) {
                            editedQuestion.value.max_manual_points = (
                              e.target as HTMLInputElement
                            ).valueAsNumber;
                            editedQuestion.value.init_points = 0;
                          }
                        }}
                      />
                      <small id="manualPointsHelp" class="form-text text-muted">
                        The is the amout of points possible from manual grading.
                      </small>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div class="mb-3">
                    <label for="autoPoints">Auto Points</label>
                    <input
                      type="text"
                      class="form-control points-list"
                      id="autoPointsInput"
                      name="autoPoints"
                      value={editedQuestion.value?.auto_points_list?.join(',')}
                      onChange={(e) => {
                        if (editedQuestion.value) {
                          editedQuestion.value.auto_points_list = (
                            e.target as HTMLInputElement
                          ).value
                            .split(',')
                            .map((v) => Number(v));
                        }
                      }}
                    />
                    <small id="autoPointsHelp" class="form-text text-muted">
                      This is a list of points that each attempt at the question is worth. Enter
                      values separated by commas.
                    </small>
                  </div>
                  <div class="mb-3">
                    <label for="manualPoints">Manual Points</label>
                    <input
                      type="number"
                      class="form-control"
                      id="manualPointsInput"
                      name="manualPoints"
                      value={editedQuestion.value?.max_manual_points ?? 0}
                      onChange={(e) => {
                        if (editedQuestion.value) {
                          editedQuestion.value.max_manual_points = (
                            e.target as HTMLInputElement
                          ).valueAsNumber;
                        }
                      }}
                    />
                    <small id="manualPointsHelp" class="form-text text-muted">
                      The is the amout of points possible from manual grading.
                    </small>
                  </div>
                </>
              )}
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Close
            </button>
            <button type="button" class="btn btn-primary" onClick={() => handleSubmit()}>
              Save changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  function DeleteQuestionModal({
    zoneIndex,
    questionIndex,
    alternativeGroupIndex,
  }: {
    zoneIndex: number;
    questionIndex: number;
    alternativeGroupIndex?: number;
  }) {
    const handleDelete = () => {
      const update = [...resolvedZones.value];
      if (alternativeGroupIndex || alternativeGroupIndex === 0) {
        update[zoneIndex].questions[questionIndex].alternatives?.splice(alternativeGroupIndex, 1);
        if (update[zoneIndex].questions[questionIndex].alternatives?.length === 0) {
          update[zoneIndex].questions.splice(questionIndex, 1);
        }
      } else {
        update[zoneIndex].questions.splice(questionIndex, 1);
      }
      resolvedZones.value = [...update];
    };
    return (
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4">Remove Question</h2>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to remove this question from the assessment?</p>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-danger"
              data-dismiss="modal"
              onClick={() => handleDelete()}
            >
              Remove Question
            </button>
            <button type="button" class="btn btn-secondary" data-dismiss="modal">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  function handleSave() {
    interface Zone {
      title?: string;
      maxPoints?: number;
      numberChoose?: number;
      bestQuestions?: number;
      questions?: Record<string, any>[];
      advanceScorePerc?: number;
      gradeRateMinutes?: number;
    }
    const zones = resolvedZones.value.map((zone) => {
      const resolvedZone: Zone = Object.fromEntries(
        Object.entries(zone).filter(([_, value]) => value && value !== 0),
      );
      resolvedZone.questions = zone.questions.map((question) => {
        const resolvedQuestion = {
          id: question.alternative_group_size === 1 ? question.qid : null,
          autoPoints:
            assessmentType === 'Homework' ? question.init_points : question.auto_points_list,
          maxAutoPoints: assessmentType === 'Homework' ? question.max_auto_points : null,
          manualPoints: question.max_manual_points ?? null,
          alternatives:
            question.alternative_group_size > 1 ? question.alternatives?.map((a) => a.qid) : null,
          forceMaxPoints: question.force_max_points ?? false,
          triesPerVariant: question.tries_per_variant === 1 ? null : question.tries_per_variant,
        };
        return Object.fromEntries(
          Object.entries(resolvedQuestion).filter(([_, value]) => value && value !== 0),
        );
      });
      return resolvedZone;
    });
    document.querySelector('.js-zones-input')?.setAttribute('value', JSON.stringify(zones));
    (document.querySelector('#zonesForm') as HTMLFormElement)?.submit();
  }

  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});

// Blank question template, used for adding new questions.
const newQuestion: AssessmentQuestionRow = {
  advance_score_perc: null,
  alternative_group_id: null,
  alternative_group_number_choose: null,
  alternative_group_number: null,
  alternative_group_size: 1,
  assessment_id: '0',
  assessment_question_advance_score_perc: null,
  auto_points_list: [],
  average_average_submission_score: null,
  average_first_submission_score: null,
  average_last_submission_score: null,
  average_max_submission_score: null,
  average_number_submissions: null,
  average_submission_score_hist: null,
  average_submission_score_variance: null,
  deleted_at: null,
  discrimination: null,
  display_name: null,
  effective_advance_score_perc: null,
  first_submission_score_hist: null,
  first_submission_score_variance: null,
  force_max_points: null,
  grade_rate_minutes: null,
  id: '0',
  incremental_submission_points_array_averages: null,
  incremental_submission_points_array_variances: null,
  incremental_submission_score_array_averages: null,
  incremental_submission_score_array_variances: null,
  init_points: null,
  json_comment: null,
  json_grade_rate_minutes: null,
  last_submission_score_hist: null,
  last_submission_score_variance: null,
  manual_rubric_id: null,
  max_auto_points: null,
  max_manual_points: null,
  max_points: null,
  max_submission_score_hist: null,
  max_submission_score_variance: null,
  mean_question_score: null,
  median_question_score: null,
  number_in_alternative_group: null,
  number_submissions_hist: null,
  number_submissions_variance: null,
  number: null,
  open_issue_count: null,
  other_assessments: null,
  points_list: null,
  qid: null,
  question_id: '0',
  question_score_variance: null,
  quintile_question_scores: null,
  some_nonzero_submission_perc: null,
  some_perfect_submission_perc: null,
  some_submission_perc: null,
  start_new_alternative_group: null,
  start_new_zone: null,
  submission_score_array_averages: null,
  submission_score_array_variances: null,
  sync_errors: null,
  sync_warnings: null,
  tags: null,
  title: null,
  topic: null,
  zone_best_questions: null,
  zone_has_best_questions: null,
  zone_has_max_points: null,
  zone_max_points: null,
  zone_number_choose: null,
  zone_number: null,
  zone_title: null,
};
