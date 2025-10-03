import { Modal } from 'react-bootstrap';

import { useState } from '@prairielearn/preact-cjs/hooks';

import type { StaffAssessmentQuestionRow } from '../../../models/assessment-question.js';
import type { ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

export function EditQuestionModal({
  question,
  showEditModal,
  onHide,
  handleUpdateQuestion,
  assessmentType,
  questionDisplayName,
  addQuestion,
}: {
  question: ZoneQuestionJson | QuestionAlternativeJson;
  showEditModal: boolean;
  onHide: () => void;
  handleUpdateQuestion: (updatedQuestion: any, gradingMethod?: 'auto' | 'manual') => void;
  assessmentType: 'Homework' | 'Exam';
  questionDisplayName: string;
  addQuestion?: boolean;
}) {
  console.log('EditQuestionModal question', question);
  const [autoGraded, setAutoGraded] = useState(
    question ? question.assessment_question.max_manual_points === 0 : true,
  );
  if (!question) {
    return null;
  }
  return (
    <Modal show={showEditModal} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{addQuestion ? 'Add Question' : 'Edit Question'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="mb-3">
          <label for="qidInput">QID</label>
          <div class="input-group">
            <input
              type="text"
              class="form-control"
              id="qidInput"
              name="qid"
              aria-describedby="qidHelp"
              value={questionDisplayName}
              onChange={(e) => {
                if (question) {
                  question.question.qid = (e.target as HTMLInputElement).value;
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
                onChange={(e) => setAutoGraded((e.target as HTMLSelectElement)?.value === 'auto')}
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
                    value={question.assessment_question.init_points ?? 0}
                    onChange={(e) => {
                      if (question) {
                        question.assessment_question.init_points = (
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
                    value={question?.assessment_question.max_auto_points ?? 0}
                    onChange={(e) => {
                      if (question) {
                        question.assessment_question.max_auto_points = (
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
                    value={question?.assessment_question.tries_per_variant ?? 0}
                    onChange={(e) => {
                      if (question) {
                        question.assessment_question.tries_per_variant = (
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
                  value={question?.assessment_question.max_manual_points ?? 0}
                  onChange={(e) => {
                    if (question) {
                      question.assessment_question.max_manual_points = (
                        e.target as HTMLInputElement
                      ).valueAsNumber;
                      question.assessment_question.init_points = 0;
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
              <label for="autoPoints">Points List</label>
              <input
                type="text"
                class="form-control points-list"
                id="autoPointsInput"
                name="autoPoints"
                value={question?.assessment_question.points_list?.join(',') || ''}
                onChange={(e) => {
                  if (question) {
                    question.assessment_question.points_list = (e.target as HTMLInputElement).value
                      .split(',')
                      .map((v) => Number(v));
                  }
                }}
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                This is a list of points that each attempt at the question is worth. Enter values
                separated by commas.
              </small>
            </div>
            <div class="mb-3">
              <label for="manualPoints">Manual Points</label>
              <input
                type="number"
                class="form-control"
                id="manualPointsInput"
                name="manualPoints"
                value={question?.assessment_question.max_manual_points ?? 0}
                onChange={(e) => {
                  if (question) {
                    question.assessment_question.max_manual_points = (
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
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Close
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            handleUpdateQuestion(
              question,
              assessmentType === 'Homework' ? (autoGraded ? 'auto' : 'manual') : undefined,
            );
          }}
        >
          {addQuestion ? 'Add question' : 'Update question'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
