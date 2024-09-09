import { html } from '@prairielearn/html';

import { TagBadgeList } from '../../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../../src/components/TopicBadge.html.js';
import {
  AssessmentQuestionRow,
  AssessmentQuestionZone,
} from '../../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';

function maxPoints({
  max_auto_points,
  max_manual_points,
  points_list,
  init_points,
  assessmentType,
}: {
  max_auto_points: number;
  max_manual_points: number;
  points_list: number[];
  init_points: number;
  assessmentType: string;
}) {
  if (max_auto_points || !max_manual_points) {
    if (assessmentType === 'Exam') {
      return (points_list || [max_manual_points]).map((p) => p - max_manual_points).join(',');
    }
    if (assessmentType === 'Homework') {
      return `${init_points - max_manual_points}/${max_auto_points}`;
    }
  } else {
    return html`&mdash;`;
  }
}

export function EditAssessmentQuestionsTable({
  zones,
  assessmentType,
  showAdvanceScorePercCol,
}: {
  zones: AssessmentQuestionZone[];
  assessmentType: string;
  showAdvanceScorePercCol: boolean;
}) {
  // TODO: Add advance score percentage column
  const nTableCols = showAdvanceScorePercCol ? 13 : 12;

  return html`
    <div class="table-responsive js-assessment-questions-table">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th><span class="sr-only">Name</span></th>
            <th>QID</th>
            <th>Topics</th>
            <th>Tags</th>
            <th>Auto Points</th>
            <th>Manual Points</th>
            <th>Other Assessments</th>
          </tr>
        </thead>
        <tbody>
          ${zones.map((zone, zoneIndex) => {
            return html`
              <tr>
                <td class="arrowButtonsCell align-content-center">
                  <div>
                    <button
                      class="btn btn-xs btn-secondary js-zone-up-arrow-button"
                      type="button"
                      data-zone-index="${zoneIndex}"
                      ${zoneIndex === 0 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary js-zone-down-arrow-button"
                      type="button"
                      data-zone-index="${zoneIndex}"
                      ${zoneIndex === zones.length - 1 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                  </div>
                </td>
                <td class="editButtonCell align-content-center">
                  <button
                    class="btn btn-sm btn-secondary js-edit-zone-button"
                    type="button"
                    data-zone-index="${zoneIndex}"
                  >
                    <i class="fa fa-edit" aria-hidden="true"></i>
                  </button>
                </td>
                <th colspan="${nTableCols - 2}" class="align-content-center">
                  Zone ${zoneIndex + 1}. ${zone.title}
                  ${zone.numberChoose == null
                    ? '(Choose all questions)'
                    : zone.numberChoose === 1
                      ? '(Choose 1 question)'
                      : `(Choose ${zone.numberChoose} questions)`}
                  ${zone.maxPoints ? `(maximum ${zone.maxPoints} points)` : ''}
                  ${zone.bestQuestions ? `(best ${zone.bestQuestions} questions)` : ''}
                </th>
              </tr>
              ${zone.questions.map((question: AssessmentQuestionRow, questionIndex: number) => {
                return html`
                  ${question.is_alternative_group
                    ? html`
                        <tr>
                          <td></td>
                          <td class="arrowButtonsCell align-content-center">
                            <div>
                              <button
                                class="btn btn-xs btn-secondary question-up-arrow-button"
                                type="button"
                                data-zone-number="${zoneIndex}"
                                data-question-number="${questionIndex}"
                                data-alternative-number="group"
                                ${zoneIndex === 0 && questionIndex === 0 ? 'disabled' : ''}
                              >
                                <i class="fa fa-arrow-up" aria-hidden="true"></i>
                              </button>
                            </div>
                            <div>
                              <button
                                class="btn btn-xs btn-secondary question-down-arrow-button"
                                type="button"
                                data-zone-number="${zoneIndex}"
                                data-question-number="${questionIndex}"
                                data-alternative-number="group"
                              >
                                <i class="fa fa-arrow-down" aria-hidden="true"></i>
                              </button>
                            </div>
                          </td>
                          <td class="editButtonCell align-content-center">
                            <button
                              class="btn btn-sm btn-secondary editGroupButton"
                              type="button"
                              data-zone-number="${zoneIndex}"
                              data-question-number="${questionIndex}"
                              data-alternative-number="group"
                              data-toggle="modal"
                              data-target="editQuestionModal"
                            >
                              <i class="fa fa-edit" aria-hidden="true"></i>
                            </button>
                          </td>
                          <td class="deleteButtonCell align-content-center">
                            <button
                              class="btn btn-sm btn-danger js-confirm-delete-button"
                              type="button"
                              data-zone-number="${zoneIndex}"
                              data-question-number="${questionIndex}"
                              data-alternative-number="group"
                              data-toggle="modal"
                              data-target="deleteQuestionModal"
                            >
                              <i class="fa fa-trash" aria-hidden="true"></i>
                            </button>
                          </td>
                          <td colspan="${nTableCols}" class="align-content-center">
                            ${question.alternative_group_number}.
                            ${question.alternative_group_number_choose == null
                              ? 'Choose all questions from:'
                              : question.alternative_group_number_choose === 1
                                ? 'Choose 1 question from:'
                                : `Choose ${question.alternative_group_number_choose} questions from:`}
                          </td>
                        </tr>
                        ${question.alternatives?.map((alternative, alternativeIndex) => {
                          return QuestionRow({
                            question: alternative,
                            zoneIndex,
                            questionIndex,
                            alternativeIndex,
                            showAdvanceScorePercCol,
                            assessmentType,
                            // For the alternative groups, pass in points from the alternative group level rather than off the specific question itself
                            init_points: question.init_points ?? 0,
                            points_list: question.points_list ?? [],
                            max_manual_points: question.max_manual_points ?? 0,
                            max_auto_points: question.max_auto_points ?? 0,
                          });
                        })}
                        <tr>
                          <td></td>
                          <td></td>
                          <td colspan="${nTableCols - 2}">
                            <button
                              class="btn btn-sm js-add-question"
                              data-zone-index="${zoneIndex}"
                              data-question-index="${questionIndex}"
                              data-alternative-index="${question.alternatives?.length}"
                            >
                              <i class="fa fa-add" aria-hidden="true"></i> Add Question to Group
                            </button>
                          </td>
                        </tr>
                      `
                    : QuestionRow({
                        question,
                        zoneIndex,
                        questionIndex,
                        showAdvanceScorePercCol,
                        assessmentType,
                        init_points: question.init_points ?? 0,
                        points_list: question.points_list ?? [],
                        max_manual_points: question.max_manual_points ?? 0,
                        max_auto_points: question.max_auto_points ?? 0,
                      })}
                `;
              })}
              <tr>
                <td></td>
                <td colspan="${nTableCols - 1}">
                  <button
                    class="btn btn-sm js-add-question"
                    data-zone-index="${zoneIndex}"
                    data-question-index="${zone.questions.length}"
                  >
                    <i class="fa fa-add" aria-hidden="true"></i> Add Question to Zone
                  </button>
                </td>
              </tr>
            `;
          })}
          <tr>
            <td colspan="${nTableCols}">
              <button class="btn btn-sm js-add-zone" data-zone-index="${zones.length}">
                <i class="fa fa-add" aria-hidden="true"></i> Add Zone
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function QuestionRow({
  question,
  zoneIndex,
  questionIndex,
  alternativeIndex,
  showAdvanceScorePercCol,
  assessmentType,
  init_points,
  points_list,
  max_manual_points,
  max_auto_points,
}: {
  question: Record<string, any>;
  zoneIndex: number;
  questionIndex: number;
  alternativeIndex?: number;
  showAdvanceScorePercCol: boolean;
  assessmentType: string;
  init_points: number;
  points_list: number[];
  max_manual_points: number;
  max_auto_points: number;
}) {
  return html`
    <tr>
      <td></td>
      ${question.is_alternative_group ? html`<td></td>` : ''}
      <td class="arrowButtonsCell align-content-center">
        <div ${question.is_alternative_group ? 'class="ml-3"' : ''}>
          <button
            class="btn btn-xs btn-secondary js-question-up-arrow-button"
            type="button"
            data-zone-index="${zoneIndex}"
            data-question-index="${questionIndex}"
            data-alternative-index="${alternativeIndex}"
            ${zoneIndex === 0 && questionIndex === 0 && alternativeIndex === undefined
              ? 'disabled'
              : ''}
          >
            <i class="fa fa-arrow-up" aria-hidden="true"></i>
          </button>
        </div>
        <div>
          <button
            class="btn btn-xs btn-secondary js-question-down-arrow-button"
            type="button"
            data-zone-index="${zoneIndex}"
            data-question-index="${questionIndex}"
            data-alternative-index="${alternativeIndex}"
          >
            <i class="fa fa-arrow-down" aria-hidden="true"></i>
          </button>
        </div>
      </td>
      <td class="edit-button-cell align-content-center">
        <button
          class="btn btn-sm btn-secondary js-edit-question-button"
          type="button"
          data-zone-index="${zoneIndex}"
          data-question-index="${questionIndex}"
          data-zone-index="${zoneIndex}"
          data-question-index="${questionIndex}"
          data-alternative-index="${alternativeIndex}"
          data-toggle="modal"
          data-target="editQuestionModal"
        >
          <i class="fa fa-edit" aria-hidden="true"></i>
        </button>
      </td>
      <td class="delete-button-cell align-content-center">
        <button
          class="btn btn-sm btn-danger js-delete-question-button"
          type="button"
          data-zone-index="${zoneIndex}"
          data-question-index="${questionIndex}"
          data-alternative-index="${alternativeIndex}"
          data-toggle="modal"
          data-target="deleteQuestionModal"
        >
          <i class="fa fa-trash" aria-hidden="true"></i>
        </button>
      </td>
      <td class="align-content-center" colspan="${question.is_alternative_group ? '1' : '2'}">
        ${!question.is_alternative_group
          ? `${question.alternative_group_number}.`
          : html`
              <span class="ml-3">
                ${question.alternative_group_number}.${question.number_in_alternative_group}.
              </span>
            `}
        ${question.title}
      </td>
      <td class="align-content-center">${question.qid}</td>
      <td>${TopicBadge(question.topic)}</td>
      <td>${TagBadgeList(question.tags)}</td>
      <td class="align-content-center">
        ${maxPoints({
          max_auto_points,
          max_manual_points,
          points_list,
          init_points,
          assessmentType,
        })}
      </td>
      <td class="align-content-center">${max_manual_points || '—'}</td>
      ${showAdvanceScorePercCol
        ? html`
            <td
              class="align-content-center ${question.assessment_question_advance_score_perc === 0
                ? 'text-muted'
                : ''}"
              data-testid="advance-score-perc"
            >
              ${question.assessment_question_advance_score_perc}%
            </td>
          `
        : ''}
      <td>
        ${question.other_assessments
          ? question.other_assessments.map((assessment: { color: string; label: string }) => {
              return html`
                <span class="badge color-${assessment.color} color-hover">
                  ${assessment.label}
                </span>
              `;
            })
          : ''}
      </td>
    </tr>
  `;
}
