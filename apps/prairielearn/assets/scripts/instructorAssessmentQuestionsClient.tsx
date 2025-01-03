import { Modal } from 'bootstrap';
import { Fragment, h, render } from 'preact';
import React, { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';

import { IssueBadge } from '../../src/components/IssueBadge.html.js';
import { SyncProblemButton } from '../../src/components/SyncProblemButton.html.js';
import { AssessmentBadge } from '../../src/components/AssessmentBadge.html.js';
import { TagBadgeList } from '../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../src/components/TopicBadge.html.js';

import { onDocumentReady, templateFromAttributes, decodeData } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

import { AssessmentQuestionRow } from '../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';
import { auto } from 'async';
import { edit } from 'ace-builds';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

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
  let questions = signal<AssessmentQuestionRow[]>(decodeData('assessment-questions-data'));
  let editMode = signal(false);
  let editedQuestion = signal<AssessmentQuestionRow | null>(null);

  function EditModeButtons() {
    return (
      <div class="ml-auto">
        {!editMode.value ? (
          <button class="btn btn-sm btn-light" onClick={() => (editMode.value = true)}>
            <i class="fa fa-edit" aria-hidden="true"></i> Edit assessment questions
          </button>
        ) : (
          <span class="js-edit-mode-buttons">
            <button class="btn btn-sm btn-light js-save-and-sync-button mx-1">
              <i class="fa fa-save" aria-hidden="true"></i> Save and sync
            </button>
            <button class="btn btn-sm btn-light" onClick={() => window.location.reload()}>
              Cancel
            </button>
          </span>
        )}
      </div>
    );
  }

  render(<EditModeButtons />, document.querySelector('.js-edit-mode-buttons') as HTMLElement);

  const modal = document.querySelector('.js-edit-question-modal') as HTMLElement;
  function AssessmentQuestionsTable() {
    // If at least one question has a nonzero unlock score, display the Advance Score column
    const showAdvanceScorePercCol =
      questions.value.map((q) => q.assessment_question_advance_score_perc !== 0).length >= 1;

    const nTableCols = showAdvanceScorePercCol ? 12 : 11;

    function maxPoints({
      max_auto_points,
      max_manual_points,
      points_list,
      init_points,
    }: {
      max_auto_points: number;
      max_manual_points: number;
      points_list: number[];
      init_points: number;
    }) {
      if (max_auto_points || !max_manual_points) {
        if (assessmentType === 'Exam') {
          return (points_list || [max_manual_points]).map((p) => p - max_manual_points).join(',');
        }
        if (assessmentType === 'Homework') {
          return `${init_points - max_manual_points}/${max_auto_points}`;
        }
      } else {
        return '—';
      }
    }

    // const handleEdit = (question: AssessmentQuestionRow, i: number) => {
    //   const update = questionState.map((q) => ({ ...q }));
    //   update[i].title = 'EDITED';
    //   setQuestionState([...update]);
    // };

    const handleEdit = (question: AssessmentQuestionRow, i: number) => {
      editedQuestion.value = { ...question };
      render(<EditQuestionModal question={question} i={i} />, modal);
      Modal.getOrCreateInstance(modal).show();
    };

    const handleDelete = (question: AssessmentQuestionRow, i: number) => {
      const update = questions.value.filter((q) => q !== question);
      if (update.length === 0) {
        questions.value = [];
      } else {
        if (question.start_new_zone) {
          update[i].start_new_zone = true;
        }
        if (question.start_new_alternative_group) {
          update[i].start_new_alternative_group = true;
        }
        questions.value = [...update];
      }
    };

    let zoneNumber = 0;
    let alternativeGroupNumber = 0;
    let numberInAlternativeGroup = 1;
    const questionRowMap = questions.value.map((question, i: number) => {
      if (question.start_new_zone) {
        zoneNumber++;
      }
      if (question.start_new_alternative_group || question.alternative_group_size === 1) {
        alternativeGroupNumber++;
      } else {
        numberInAlternativeGroup++;
      }
      const number =
        question.alternative_group_size === 1
          ? `${alternativeGroupNumber}.`
          : `${alternativeGroupNumber}.${numberInAlternativeGroup}.`;

      const issueBadge = IssueBadge({
        urlPrefix,
        count: question.open_issue_count ?? 0,
        issueQid: question.qid,
      });

      const title = `${number} ${question.title}`;

      return (
        <>
          {question.start_new_zone ? (
            <tr key={`zone-${i}`}>
              <th colspan={nTableCols}>
                Zone {zoneNumber}. {question.zone_title}
                {question.zone_number_choose == null
                  ? '(Choose all questions)'
                  : question.zone_number_choose === 1
                    ? '(Choose 1 question)'
                    : `(Choose ${question.zone_number_choose} questions)`}
                {question.zone_has_max_points ? `(maximum ${question.zone_max_points} points)` : ''}
                {question.zone_has_best_questions
                  ? `(best ${question.zone_best_questions} questions)`
                  : ''}
              </th>
            </tr>
          ) : (
            ''
          )}
          {question.start_new_alternative_group && question.alternative_group_size > 1 ? (
            <tr>
              <td colspan={nTableCols}>
                {alternativeGroupNumber}.
                {question.alternative_group_number_choose == null
                  ? 'Choose all questions from:'
                  : question.alternative_group_number_choose === 1
                    ? 'Choose 1 question from:'
                    : `Choose ${question.alternative_group_number_choose} questions from:`}
              </td>
            </tr>
          ) : (
            ''
          )}
          <tr key={`question-${i}`}>
            {editMode.value ? (
              <>
                <td>
                  <button class="btn btn-sm btn-secondary" onClick={() => handleEdit(question, i)}>
                    <i class="fa fa-edit" aria-hidden="true"></i>
                  </button>
                </td>
                <td>
                  <button class="btn btn-sm btn-danger" onClick={() => handleDelete(question, i)}>
                    <i class="fa fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
              </>
            ) : (
              ''
            )}
            <td>
              {hasCoursePermissionPreview ? (
                <>
                  <a href={`${urlPrefix}/question/${question.question_id}/`}>{title}</a>{' '}
                  {/* TODO: make this issue badge a component */}
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
                { title }
              )}
            </td>
            <td>
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
              <span class={`badge color-${question.topic.color}`}>{question.topic.name}</span>
            </td>
            <td>
              {question.tags?.map((tag) => {
                return <span class={`badge color-${tag.color}`}>{tag.name}</span>;
              })}
            </td>
            <td>
              {maxPoints({
                max_auto_points: question.max_auto_points ?? 0,
                max_manual_points: question.max_manual_points ?? 0,
                points_list: question.points_list ?? [],
                init_points: question.init_points ?? 0,
              })}
            </td>
            <td>{question.max_manual_points || '—'}</td>
            {showAdvanceScorePercCol ? (
              <td
                class="${question.assessment_question_advance_score_perc === 0
                          ? 'text-muted'
                          : ''}"
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
                    class={`btn btn-badge color-${assessment.color}`}
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
                  data-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                >
                  Action <span class="caret"></span>
                </button>

                <div class="dropdown-menu">
                  {hasCourseInstancePermissionEdit ? (
                    <button
                      class="dropdown-item"
                      data-toggle="modal"
                      data-target="#resetQuestionVariantsModal"
                      data-assessment-question-id="${question.id}"
                    >
                      Reset question variants
                    </button>
                  ) : (
                    <button class="dropdown-item disabled" disabled>
                      Must have editor permission
                    </button>
                  )}
                </div>
              </div>
            </td>
          </tr>
        </>
      );
    });

    return (
      <table class="table table-sm table-hover" aria-label="Assessment questions">
        <thead>
          <tr>
            {editMode.value ? (
              <>
                <th>Edit</th>
                <th>Delete</th>
              </>
            ) : (
              ''
            )}
            <th>
              <span class="sr-only">Name</span>
            </th>
            <th>QID</th>
            <th>Topic</th>
            <th>Tags</th>
            <th>Auto Points</th>
            <th>Manual Points</th>
            {showAdvanceScorePercCol ? <th>Advance Score</th> : ''}
            <th width="100">Mean score</th>
            <th>Num. Submissions Histogram</th>
            <th>Other Assessments</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>{questionRowMap}</tbody>
      </table>
    );
  }
  render(<AssessmentQuestionsTable />, assessmentQuestionsTable);

  function EditQuestionModal({ question, i }: { question: AssessmentQuestionRow; i: number }) {
    const [autoGraded, setAutoGraded] = useState(question.max_manual_points === 0);
    const handleSubmit = () => {
      Modal.getOrCreateInstance(document.querySelector('.js-edit-question-modal')).hide();
      const update: AssessmentQuestionRow[] = questions.value.map((q) => ({ ...q }));
      update[i] = editedQuestion.value ?? update[i];
      questions.value = [...update];
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
              <div class="form-group">
                <label for="qidInput">QID</label>
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control js-qid-input"
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
                  <div class="form-group">
                    <label for="gradingMethod" class="form-label">
                      Grading Method
                    </label>
                    <select
                      class="form-control"
                      id="gradingMethod"
                      name="gradingMethod"
                      onChange={(e) => setAutoGraded(e.target?.value === 'auto')}
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
                      <div class="form-group js-hw-auto-points">
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
                      <div class="form-group js-hw-auto-points">
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
                      <div class="form-group js-hw-auto-points">
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
                    <div class="form-group js-hw-manual-points">
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
                  <div class="form-group">
                    <label for="autoPoints">Auto Points</label>
                    <input
                      type="text"
                      class="form-control points-list"
                      id="autoPointsInput"
                      name="autoPoints"
                      value={editedQuestion.value?.points_list?.join(',')}
                      onChange={(e) => {
                        if (editedQuestion.value) {
                          editedQuestion.value.points_list = (e.target as HTMLInputElement).value
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
                  <div class="form-group">
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

  // To do: we should now be able to render these directly in the questionRowMap
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
