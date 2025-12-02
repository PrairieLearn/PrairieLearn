import clsx from 'clsx';
import { Modal } from 'react-bootstrap';

import { useMemo, useState } from '@prairielearn/preact-cjs/hooks';

import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

export type EditQuestionModalState =
  | { type: 'closed' }
  | {
      type: 'create';
      question: ZoneQuestionJson | QuestionAlternativeJson;
      alternativeGroup?: ZoneQuestionJson;
    }
  | {
      type: 'edit';
      question: ZoneQuestionJson | QuestionAlternativeJson;
      alternativeGroup?: ZoneQuestionJson;
    };

/**
 * Parse auto points from string to array
 */
function parseAutoPointsForSave(
  value: string,
  assessmentType: 'Homework' | 'Exam',
): number | number[] {
  if (assessmentType === 'Exam') {
    // For exams, parse string as array
    const trimmed = value.trim();
    if (trimmed === '') return [];
    return trimmed
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => !Number.isNaN(v));
  }
  return Number(value);
}

/**
 * Helper function to check if a value on an alternative question is inherited from the parent group.
 */
function isInherited(
  fieldName: keyof ZoneQuestionJson | keyof QuestionAlternativeJson,
  isAlternative: boolean,
  localQuestion: ZoneQuestionJson | QuestionAlternativeJson,
  alternativeGroup?: ZoneQuestionJson,
): boolean {
  if (!isAlternative || !alternativeGroup) return false;
  return (
    (!(fieldName in localQuestion) ||
      localQuestion[fieldName as keyof typeof localQuestion] === undefined) &&
    fieldName in alternativeGroup &&
    alternativeGroup[fieldName as keyof typeof alternativeGroup] !== undefined
  );
}

export function EditQuestionModal({
  editQuestionModalState,
  onHide,
  handleUpdateQuestion,
  assessmentType,
  qidValidationError,
}: {
  editQuestionModalState: EditQuestionModalState;
  onHide: () => void;
  handleUpdateQuestion: (updatedQuestion: ZoneQuestionJson | QuestionAlternativeJson) => void;
  assessmentType: 'Homework' | 'Exam';
  qidValidationError?: string;
}) {
  const { type } = editQuestionModalState;
  const question = type !== 'closed' ? editQuestionModalState.question : null;
  const alternativeGroup = type !== 'closed' ? editQuestionModalState.alternativeGroup : undefined;
  const isAlternative = !!alternativeGroup;
  const [isPointsInherited, setIsPointsInherited] = useState(false);
  const [isMaxPointsInherited, setIsMaxPointsInherited] = useState(false);
  const [autoPointsDisplayValue, setAutoPointsDisplayValue] = useState<string | number | number[]>(
    question?.points ??
      question?.autoPoints ??
      alternativeGroup?.points ??
      alternativeGroup?.autoPoints ??
      '',
  );
  const [manualPointsDisplayValue, setManualPointsDisplayValue] = useState<string | number>(
    question?.manualPoints ?? alternativeGroup?.manualPoints ?? '',
  );

  // Determine which property was originally set for points (points vs autoPoints)
  // Check own values first, then inherited values
  const originalPointsProperty = useMemo<'points' | 'autoPoints'>(() => {
    if (question?.points !== undefined) return 'points';
    if (question?.autoPoints !== undefined) return 'autoPoints';
    if (isAlternative) {
      if (alternativeGroup.points !== undefined) {
        setIsPointsInherited(true);
        return 'points';
      }
      if (alternativeGroup.autoPoints !== undefined) {
        setIsPointsInherited(true);
        return 'autoPoints';
      }
    }
    return 'autoPoints';
  }, [question, alternativeGroup, isAlternative]);

  // Determine which max property was originally set for auto grading (maxPoints vs maxAutoPoints)
  // Prefer matching the points property (points → maxPoints, autoPoints → maxAutoPoints)
  const originalMaxProperty = useMemo<'maxPoints' | 'maxAutoPoints'>(() => {
    // Check own question first
    if (question?.maxAutoPoints !== undefined) return 'maxAutoPoints';
    if (question?.maxPoints !== undefined) return 'maxPoints';

    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup.maxAutoPoints !== undefined) {
        setIsMaxPointsInherited(true);
        return 'maxAutoPoints';
      }
      if (alternativeGroup.maxPoints !== undefined) {
        setIsMaxPointsInherited(true);
        return 'maxPoints';
      }
    }
    // Default: match the points property
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  }, [question, alternativeGroup, isAlternative, originalPointsProperty]);

  const [localQuestion, setLocalQuestion] = useState<
    ZoneQuestionJson | QuestionAlternativeJson | null
  >(() => (type !== 'closed' ? structuredClone(question) : null));

  if (type === 'closed') return null;
  if (!localQuestion) return null;

  const maxAutoPointsDisplayValue =
    localQuestion[originalMaxProperty] ?? alternativeGroup?.[originalMaxProperty] ?? '';

  return (
    <Modal show={true} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add question' : 'Edit question'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div class="mb-3">
          <label for="qidInput">QID</label>
          <div class="input-group">
            <input
              type="text"
              class={clsx('form-control', qidValidationError && 'is-invalid')}
              id="qidInput"
              name="qid"
              aria-describedby="qidHelp qidError"
              value={localQuestion.id ?? ''}
              onChange={(e) => {
                const newId = (e.target as HTMLInputElement).value;
                setLocalQuestion((prev) => ({ ...prev, id: newId }));
              }}
            />
          </div>
          {qidValidationError && (
            <div id="qidError" class="invalid-feedback d-block">
              {qidValidationError}
            </div>
          )}
          <small id="qidHelp" class="form-text text-muted">
            The unique identifier for the question.
          </small>
        </div>
        {assessmentType === 'Homework' ? (
          <>
            <div class="mb-3">
              <label for="autoPointsInput">Auto Points</label>
              <input
                type="number"
                class="form-control"
                id="autoPointsInput"
                name="autoPoints"
                value={autoPointsDisplayValue.toString()}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    // Clear the value to inherit from group
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.points;
                      delete updated.autoPoints;
                      return updated;
                    });
                    setAutoPointsDisplayValue('');
                  } else {
                    const numValue = Number(value);
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.points;
                      delete updated.autoPoints;
                      updated[originalPointsProperty] = numValue;
                      return updated;
                    });
                    setAutoPointsDisplayValue(numValue);
                  }
                }}
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                The amount of points each attempt at the question is worth.
                {isPointsInherited ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
            <div class="mb-3">
              <label for="maxAutoPointsInput">Max Auto Points</label>
              <input
                type="number"
                class="form-control"
                id="maxAutoPointsInput"
                name="maxAutoPoints"
                value={maxAutoPointsDisplayValue}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    // Clear to inherit
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.maxAutoPoints;
                      delete updated.maxPoints;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      // Clear all max properties to avoid conflicts
                      delete updated.maxPoints;
                      delete updated.maxAutoPoints;
                      // Use the original property (conversion will happen on save)
                      updated[originalMaxProperty] = numValue;
                      return updated;
                    });
                  }
                }}
              />
              <small id="maxPointsHelp" class="form-text text-muted">
                The maximum number of points that can be awarded for the question.
                {isMaxPointsInherited ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
            <div class="mb-3">
              <label for="manualPointsInput">Manual Points</label>
              <input
                type="number"
                class="form-control"
                id="manualPointsInput"
                name="manualPoints"
                value={
                  localQuestion.manualPoints !== undefined
                    ? localQuestion.manualPoints
                    : isAlternative && alternativeGroup.manualPoints !== undefined
                      ? alternativeGroup.manualPoints
                      : ''
                }
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.manualPoints;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        manualPoints: numValue,
                      };
                    });
                  }
                }}
              />
              <small id="manualPointsHelp" class="form-text text-muted">
                The amount of points possible from manual grading.
                {isInherited('manualPoints', isAlternative, localQuestion, alternativeGroup) ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
            <div class="mb-3">
              <label for="triesPerVariantInput">Tries Per Variant</label>
              <input
                type="number"
                class="form-control"
                id="triesPerVariantInput"
                name="triesPerVariant"
                step="1"
                value={
                  localQuestion.triesPerVariant !== undefined
                    ? localQuestion.triesPerVariant
                    : isAlternative && alternativeGroup.triesPerVariant !== undefined
                      ? alternativeGroup.triesPerVariant
                      : ''
                }
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.triesPerVariant;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      return { ...prev, triesPerVariant: numValue };
                    });
                  }
                }}
              />
              <small id="triesPerVariantHelp" class="form-text text-muted">
                This is the number of attempts a student has to answer the question before getting a
                new variant.
                {isInherited('triesPerVariant', isAlternative, localQuestion, alternativeGroup) ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
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
                value={autoPointsDisplayValue.toString()}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setLocalQuestion((prev) => {
                    if (!prev) return null;
                    const updated = { ...prev };
                    // Clear conflicting properties
                    delete updated.points;
                    delete updated.autoPoints;

                    // For exams with manual points, we must use 'autoPoints' not 'points'
                    // because 'points' and 'manualPoints' cannot coexist
                    const propertyToUse =
                      updated.manualPoints !== undefined ? 'autoPoints' : originalPointsProperty;

                    // Store as string while editing (will be converted to array on save)
                    // Type assertion needed because we temporarily store as string
                    updated[propertyToUse] = value as any;
                    return updated;
                  });
                  setAutoPointsDisplayValue(value);
                }}
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                This is a list of points that each attempt at the question is worth. Enter values
                separated by commas.
                {isPointsInherited ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
            <div class="mb-3">
              <label for="manualPoints">Manual Points</label>
              <input
                type="number"
                class="form-control"
                id="manualPointsInput"
                name="manualPoints"
                value={manualPointsDisplayValue.toString()}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      delete updated.manualPoints;
                      return updated;
                    });
                    setManualPointsDisplayValue('');
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
                      if (!prev) return null;
                      const updated = { ...prev };
                      if (updated.points !== undefined) {
                        updated.autoPoints = updated.points;
                        delete updated.points;
                      }
                      updated.manualPoints = numValue;
                      return updated;
                    });
                    setManualPointsDisplayValue(numValue);
                  }
                }}
              />
              <small id="manualPointsHelp" class="form-text text-muted">
                The amount of points possible from manual grading.
                {isInherited('manualPoints', isAlternative, localQuestion, alternativeGroup) ? (
                  <>
                    {' '}
                    <em>(Inherited from alternative group)</em>
                  </>
                ) : null}
              </small>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-secondary" onClick={onHide}>
          Close
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => {
            const questionToSave = { ...localQuestion };

            // For exam assessments, convert string points back to number array
            if (assessmentType === 'Exam') {
              const pointsValue = questionToSave.points ?? questionToSave.autoPoints;
              if (pointsValue !== undefined && typeof pointsValue === 'string') {
                const parsedValue = parseAutoPointsForSave(pointsValue, assessmentType);
                if (questionToSave.points !== undefined) {
                  questionToSave.points = parsedValue;
                } else {
                  questionToSave.autoPoints = parsedValue;
                }
              }
            }

            handleUpdateQuestion(questionToSave);
          }}
        >
          {type === 'create' ? 'Add question' : 'Update question'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
