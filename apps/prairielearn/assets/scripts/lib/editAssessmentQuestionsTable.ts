import { html } from '@prairielearn/html';

import { Modal } from '../../../src/components/Modal.html';
import { TagBadgeList } from '../../../src/components/TagBadge.html';
import { TopicBadge } from '../../../src/components/TopicBadge.html';
import { AssessmentQuestionRow } from '../../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types';

function maxPoints({
  max_auto_points,
  max_manual_points,
  points_list,
  init_points,
  assessmentType,
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
  zones: any[];
  assessmentType: string;
  showAdvanceScorePercCol: boolean;
}) {
  const nTableCols = showAdvanceScorePercCol ? 12 : 11;

  return html`
    <div class="table-responsive js-assessment-questions-table">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
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
                      class="btn btn-xs btn-secondary zone-up-arrow-button"
                      type="button"
                      data-zone-number="${zoneIndex}"
                      ${zoneIndex === 0 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary zone-down-arrow-button"
                      type="button"
                      data-zone-number="${zoneIndex}"
                      ${zoneIndex === zones.length - 1 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                  </div>
                </td>
                <th colspan="${nTableCols - 1}" class="align-content-center">
                  Zone ${zoneIndex + 1}. ${zone.title}
                  ${zone.numberChoose == null
                    ? '(Choose all questions)'
                    : zone.numberChoose === 1
                      ? '(Choose 1 question)'
                      : `(Choose ${zone.numberChoose} questions)`}
                  ${zone.maxPoints ? `(maximum ${zone.maxPoints} points)` : ''}
                  ${zone.bestQuestions ? `(best ${zone.BestQuestions} questions)` : ''}
                </th>
              </tr>
              ${zone.questions.map((question, questionIndex) => {
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
                              class="btn btn-sm btn-danger deleteQuestionButton"
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
                        ${question.alternatives.map((alternative, alternativeIndex) => {
                          return questionRow({
                            question: alternative,
                            zoneIndex,
                            questionIndex,
                            alternativeIndex,
                            showAdvanceScorePercCol,
                            assessmentType,
                          });
                        })}
                        <tr>
                          <td></td>
                          <td></td>
                          <td colspan="${nTableCols - 2}">
                            <button class="btn btn-sm addQuestion">
                              <i class="fa fa-add" aria-hidden="true"></i> Add Question to Group
                            </button>
                          </td>
                        </tr>
                      `
                    : questionRow({
                        question,
                        zoneIndex,
                        questionIndex,
                        showAdvanceScorePercCol,
                        assessmentType,
                      })}
                `;
              })}
              <tr>
                <td></td>
                <td colspan="${nTableCols - 1}">
                  <button class="btn btn-sm addQuestion">
                    <i class="fa fa-add" aria-hidden="true"></i> Add Question to Zone
                  </button>
                </td>
              </tr>
            `;
          })}
          <tr>
            <td colspan="${nTableCols}">
              <button class="btn btn-sm">
                <i class="fa fa-add" aria-hidden="true"></i> Add Zone
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function questionRow({
  question,
  zoneIndex,
  questionIndex,
  alternativeIndex,
  showAdvanceScorePercCol,
  assessmentType,
}: {
  question: Record<string, any>;
  zoneIndex: number;
  questionIndex: number;
  alternativeIndex?: number;
  showAdvanceScorePercCol: boolean;
  assessmentType: string;
}) {
  return html`
    <tr>
      <td></td>
      <td class="arrowButtonsCell align-content-center">
        <div ${question.is_alternative_group ? 'class="ml-3"' : ''}>
          <button
            class="btn btn-xs btn-secondary question-up-arrow-button"
            type="button"
            data-zone-number="${zoneIndex}"
            data-question-number="${questionIndex}"
            data-alternative-number="${alternativeIndex}"
            ${zoneIndex === 0 && questionIndex === 0 && alternativeIndex === undefined
              ? 'disabled'
              : ''}
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
            data-alternative-number="${alternativeIndex}"
          >
            <i class="fa fa-arrow-down" aria-hidden="true"></i>
          </button>
        </div>
      </td>
      <td class="editButtonCell align-content-center">
        <button
          class="btn btn-sm btn-secondary editButton"
          type="button"
          data-zone-number="${zoneIndex}"
          data-question-number="${questionIndex}"
          data-zone-number="${zoneIndex}"
          data-question-number="${questionIndex}"
          data-alternative-number="${alternativeIndex}"
          data-toggle="modal"
          data-target="editQuestionModal"
        >
          <i class="fa fa-edit" aria-hidden="true"></i>
        </button>
      </td>
      <td class="deleteButtonCell align-content-center">
        <button
          class="btn btn-sm btn-danger deleteQuestionButton"
          type="button"
          data-zone-number="${zoneIndex}"
          data-question-number="${questionIndex}"
          data-alternative-number="${alternativeIndex}"
          data-toggle="modal"
          data-target="deleteQuestionModal"
        >
          <i class="fa fa-trash" aria-hidden="true"></i>
        </button>
      </td>
      <td class="align-content-center">
        ${!question.is_alternative_group
          ? `${question.alternative_group_number}.`
          : html`
              <span class="ml-3">
                ${question.alternative_group_number}.${question.number_in_alternative_group}.
              </span>
            `}
        ${question.title}
      </td>
      <td class="align-content-center">${question.display_name}</td>
      <td>${TopicBadge(question.topic)}</td>
      <td>${TagBadgeList(question.tags)}</td>
      <td class="align-content-center">
        ${maxPoints({
          max_auto_points: question.max_auto_points,
          max_manual_points: question.max_manual_points,
          points_list: question.points_list,
          init_points: question.init_points,
          assessmentType,
        })}
      </td>
      <td class="align-content-center">${question.max_manual_points || '—'}</td>
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
          ? question.other_assessments.map((assessment) => {
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
