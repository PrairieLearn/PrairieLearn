import { Fragment, h, render } from 'preact';
import React, { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { html } from '@prairielearn/html';

import { IssueBadge } from '../../src/components/IssueBadge.html.js';
import { SyncProblemButton } from '../../src/components/SyncProblemButton.html.js';
import { AssessmentBadge } from '../../src/components/AssessmentBadge.html.js';
import { TagBadgeList } from '../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../src/components/TopicBadge.html.js';

import { onDocumentReady, templateFromAttributes, decodeData } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';
import { max } from 'lodash';

import { AssessmentQuestionRow } from '../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';

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
  let editMode = signal(false);

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

  function AssessmentQuestionsTable({ questions }: { questions: AssessmentQuestionRow[] }) {
    const [questionState, setQuestionState] = useState(questions);
    // If at least one question has a nonzero unlock score, display the Advance Score column
    const showAdvanceScorePercCol =
      questionState.map((q) => q.assessment_question_advance_score_perc !== 0).length >= 1;

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
        return `&mdash;`;
      }
    }

    const handleEdit = (question: AssessmentQuestionRow, i: number) => {
      const update = questionState.map((q) => ({ ...q }));
      update[i].title = 'EDITED';
      setQuestionState([...update]);
    };

    const questionRowMap = questionState.map((question, i: number) => {
      const number =
        question.alternative_group_size === 1 ? (
          `${question.alternative_group_number}.`
        ) : (
          <span class="ml-3">
            ${question.alternative_group_number}.${question.number_in_alternative_group}.
          </span>
        );

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
                Zone {question.zone_number}. {question.zone_title}
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
                {question.alternative_group_number}.
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
              <td>
                <button class="btn btn-sm btn-light" onClick={() => handleEdit(question, i)}>
                  edit
                </button>
              </td>
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
                max_auto_points: question.max_auto_points,
                max_manual_points: question.max_manual_points,
                points_list: question.points_list,
                init_points: question.init_points,
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
            {editMode.value ? <th></th> : ''}
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
  render(
    <AssessmentQuestionsTable questions={decodeData('assessment-questions-data')} />,
    assessmentQuestionsTable,
  );

  // To do: we should now be able to render these directly in the questionRowMap
  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
