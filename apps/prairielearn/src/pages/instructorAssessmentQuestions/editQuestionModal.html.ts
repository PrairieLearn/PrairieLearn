import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';

import { AssessmentQuestionRow } from './instructorAssessmentQuestions.types.js';

export function EditQuestionModal({
  newQuestion,
  question,
  zoneIndex,
  questionIndex,
  alternativeIndex,
  assessmentType,
}: {
  newQuestion: boolean;
  question?: AssessmentQuestionRow;
  zoneIndex: number;
  questionIndex: number;
  alternativeIndex?: number;
  assessmentType: string;
}) {
  return Modal({
    id: 'editQuestionModal',
    title: newQuestion ? 'Add Question' : 'Update Question',
    body: html`
      <input type="hidden" name="zoneIndex" id="zoneIndexInput" value="${zoneIndex}" />
      <input type="hidden" name="questionIndex" id="questionIndexInput" value="${questionIndex}" />
      <input
        type="hidden"
        name="alternativeIndex"
        id="alternativeIndexInput"
        value="${alternativeIndex}"
      />
      <input type="hidden" name="title" id="titleInput" value="${question?.title}" />
      <input type="hidden" name="tags" id="tagsInput" value="${JSON.stringify(question?.tags)}" />
      <input
        type="hidden"
        name="otherAssessments"
        id="otherAssessmentsInput"
        value="${JSON.stringify(question?.other_assessments)}"
      />
      <input
        type="hidden"
        name="topic"
        id="topicInput"
        value="${JSON.stringify(question?.topic)}"
      />
      <div class="form-group">
        <label for="qidInput">QID</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control js-qid-input"
            id="qidInput"
            name="qid"
            aria-describedby="qidHelp"
            value="${question?.qid}"
            readonly="readonly"
          />
          <div class="input-group-append">
            <button type="button" class="btn btn-primary js-find-qid">
              <i class="fa fa-magnifying-glass" aria-hidden="true"></i> Find QID
            </button>
          </div>
        </div>
        <small id="uidHelp" class="form-text text-muted"> This is the unique question ID. </small>
      </div>
      ${assessmentType === 'Homework'
        ? html`
            <div class="form-group">
              <label for="gradingMethod" class="form-label">Grading Method</label>
              <select class="form-control" id="gradingMethod" name="gradingMethod">
                <option
                  value="auto"
                  ${newQuestion || question?.max_manual_points === 0 ? 'selected' : ''}
                >
                  Auto
                </option>
                <option value="manual" ${question?.max_manual_points ? 'selected' : ''}>
                  Manual
                </option>
              </select>
              <small id="gradingMethodHelp" class="form-text text-muted"
                >Whether points for the question will be given automatically or manaullys.</small
              >
            </div>
            <div class="form-group js-hw-auto-points">
              <label for="autoPointsInput">Auto Points</label>
              <input
                type="number"
                class="form-control"
                id="autoPointsInput"
                name="autoPoints"
                value="${question?.init_points}"
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
                value="${question?.max_auto_points}"
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
                value="${question?.tries_per_variant}"
              />
              <small id="triesPerVariantHelp" class="form-text text-muted"
                >This is the number of attempts a student has to answer the question before getting
                a new variant.</small
              >
            </div>
            <div class="form-group js-hw-manual-points">
              <label for="manualPointsInput">Manual Points</label>
              <input
                type="number"
                class="form-control"
                id="manualPointsInput"
                name="manualPoints"
                value="${question?.max_manual_points}"
              />
              <small id="manualPointsHelp" class="form-text text-muted"
                >The is the amout of points possible from manual grading.</small
              >
            </div>
          `
        : ''}
      ${assessmentType === 'Exam'
        ? html`<div class="form-group">
              <label for="autoPoints">Auto Points</label>
              <input
                type="text"
                class="form-control points-list"
                id="autoPointsInput"
                name="autoPoints"
                value="${question?.points_list?.join(',')}"
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                This is a list of points that each attempt at the question is worth. Enter values
                separated by commas.
              </small>
            </div>
            <div class="form-group">
              <label for="manualPoints">Manual Points</label>
              <input
                type="text"
                class="form-control"
                id="manualPointsInput"
                name="manualPoints"
                value="${question?.max_manual_points}"
              />
              <small id="manualPointsHelp" class="form-text text-muted"
                >The is the amout of points possible from manual grading.</small
              >
            </div> `
        : ''}
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary"
        id="updateQuestionButton"
        data-dismiss="modal"
        ${newQuestion ? 'disabled' : ''}
      >
        ${newQuestion ? 'Add question' : 'Update question'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
