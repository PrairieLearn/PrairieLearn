import { Dropdown, Modal } from 'bootstrap';
import { Fragment, render } from 'preact';
import React, { useEffect, useState } from 'preact/hooks';

import { decodeData, onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { SyncProblemButton } from '../../src/components/SyncProblemButton.html.js';
// import { AssessmentBadge } from '../../src/components/AssessmentBadge.html.js';
// import {
//   AssessmentQuestionHeaders,
//   AssessmentQuestionNumber,
// } from '../../src/components/AssessmentQuestions.html.js';
// import { IssueBadge } from '../../src/components/IssueBadge.html.js';
// import { TagBadgeList } from '../../src/components/TagBadge.html.js';
// import { TopicBadge } from '../../src/components/TopicBadge.html.js';
// import type { Course } from '../../src/lib/db-types.js';
// import { idsEqual } from '../../src/lib/id.js';

import {
  type AssessmentAlternativeQuestion,
  type AssessmentQuestionRow,
} from '../../src/models/assessment-question.js';

import { histmini } from './lib/histmini.js';

interface Zone {
  title: string | null;
  maxPoints: number | null;
  numberChoose: number | null;
  bestQuestions: number | null;
  questions: AssessmentQuestionRow[];
  advanceScorePerc: number | null;
  gradeRateMinutes?: number | null;
}

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

  const resolvedZones = zones;

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
            {question.qid}
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
              auto_points_list: question.points_list ?? [],
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

    const zoneRowMap = resolvedZones.map((zone, zoneIndex) => {
      return (
        // We must use explicit <Fragement> syntax to include keys.
        <Fragment key={`zone-${zoneIndex}`}>
          <tr>
            <th colspan={nTableCols} class="align-content-center">
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
        </Fragment>
      );
    });

    return (
      <table class="table table-sm table-hover" aria-label="Assessment questions">
        <thead>
          <tr>
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

  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
