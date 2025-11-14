import { Modal } from 'react-bootstrap';

import { useEffect, useMemo, useState } from '@prairielearn/preact-cjs/hooks';

import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

export function EditQuestionModal({
  question,
  alternativeGroup,
  showEditModal,
  onHide,
  handleUpdateQuestion,
  assessmentType,
  addQuestion,
  qidValidationError,
}: {
  question: ZoneQuestionJson | QuestionAlternativeJson;
  alternativeGroup?: ZoneQuestionJson | null;
  showEditModal: boolean;
  onHide: () => void;
  handleUpdateQuestion: (updatedQuestion: any) => void;
  assessmentType: 'Homework' | 'Exam';
  addQuestion?: boolean;
  qidValidationError?: string;
}) {
  // Determine if we're editing an alternative (has a parent group)
  const isAlternative = !!alternativeGroup;

  // Determine which property was originally set for points (points vs autoPoints)
  // Check own values first, then inherited values
  const originalPointsProperty = useMemo<'points' | 'autoPoints'>(() => {
    // Check own question first
    if (question.points !== undefined) return 'points';
    if (question.autoPoints !== undefined) return 'autoPoints';
    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup.points !== undefined) return 'points';
      if (alternativeGroup.autoPoints !== undefined) return 'autoPoints';
    }
    // Default to 'autoPoints' for homework, 'points' for exams
    return assessmentType === 'Exam' ? 'points' : 'autoPoints';
  }, [question, alternativeGroup, isAlternative, assessmentType]);

  // Determine which max property was originally set for auto grading (maxPoints vs maxAutoPoints)
  // Prefer matching the points property (points → maxPoints, autoPoints → maxAutoPoints)
  const originalMaxProperty = useMemo<'maxPoints' | 'maxAutoPoints'>(() => {
    // Check own question first
    if (question.maxAutoPoints !== undefined) return 'maxAutoPoints';
    if (question.maxPoints !== undefined) return 'maxPoints';

    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup.maxAutoPoints !== undefined) return 'maxAutoPoints';
      if (alternativeGroup.maxPoints !== undefined) return 'maxPoints';
    }

    // Default: match the points property
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  }, [question, alternativeGroup, isAlternative, originalPointsProperty]);

  const [localQuestion, setLocalQuestion] = useState<ZoneQuestionJson | QuestionAlternativeJson>(
    () => structuredClone(question),
  );

  // Check if a value is inherited (only for alternatives)
  const isInherited = (fieldName: keyof ZoneQuestionJson | keyof QuestionAlternativeJson) => {
    if (!isAlternative) return false;
    return (
      (!(fieldName in localQuestion) ||
        localQuestion[fieldName as keyof typeof localQuestion] === undefined) &&
      fieldName in alternativeGroup &&
      alternativeGroup[fieldName as keyof typeof alternativeGroup] !== undefined
    );
  };

  // Check if points/autoPoints is inherited (special case since we track which one to use)
  const isPointsInherited = () => {
    if (!isAlternative) return false;
    return (
      localQuestion[originalPointsProperty] === undefined &&
      alternativeGroup[originalPointsProperty] !== undefined
    );
  };

  // Format auto points for display (handles both single numbers and arrays)
  const formatAutoPoints = (value: number | number[] | undefined): string => {
    if (value === undefined) return '';
    if (Array.isArray(value)) return value.join(',');
    return String(value);
  };

  // Parse auto points from string to array (only used on save, not on every keystroke)
  const parseAutoPointsForSave = (value: string | number | number[]): number | number[] => {
    // If it's already a number or array, return as-is
    if (typeof value !== 'string') {
      return value;
    }

    if (assessmentType === 'Exam') {
      // For exams, parse string as array
      const trimmed = value.trim();
      if (trimmed === '') return [];
      return trimmed
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => !Number.isNaN(v));
    }
    // For homework, parse as single number
    return Number(value);
  };

  // Get the auto points value to display (own or inherited)
  // Uses the originalPointsProperty to determine which field to check
  const getAutoPointsDisplayValue = () => {
    const ownValue = localQuestion[originalPointsProperty];
    if (ownValue !== undefined) {
      return formatAutoPoints(ownValue);
    }
    if (isAlternative) {
      const inheritedValue = alternativeGroup[originalPointsProperty];
      if (inheritedValue !== undefined) {
        return formatAutoPoints(inheritedValue);
      }
    }
    return '';
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      const newQuestion = structuredClone(question);
      setLocalQuestion(newQuestion);
    });
  }, [question]);

  // Get the max auto points value to display (own or inherited)
  // Uses the originalMaxProperty to determine which field to check
  const getMaxAutoPointsDisplayValue = () => {
    const ownValue = localQuestion[originalMaxProperty];
    if (ownValue !== undefined) {
      return ownValue;
    }
    if (isAlternative) {
      const inheritedValue = alternativeGroup[originalMaxProperty];
      if (inheritedValue !== undefined) {
        return inheritedValue;
      }
    }
    return '';
  };

  // Check if max points is inherited (special case since we track which one to use)
  const isMaxPointsInherited = () => {
    if (!isAlternative) return false;
    return (
      localQuestion[originalMaxProperty] === undefined &&
      alternativeGroup[originalMaxProperty] !== undefined
    );
  };

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
              class={`form-control ${qidValidationError ? 'is-invalid' : ''}`}
              id="qidInput"
              name="qid"
              aria-describedby="qidHelp qidError"
              value={localQuestion.id}
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
            {' '}
            This is the unique question ID.{' '}
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
                value={getAutoPointsDisplayValue()}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    // Clear the value to inherit from group
                    setLocalQuestion((prev) => {
                      const updated = { ...prev };
                      delete updated.points;
                      delete updated.autoPoints;
                      return updated;
                    });
                  } else {
                    const numValue = Number(value);
                    setLocalQuestion((prev) => {
                      const updated = { ...prev };
                      // Clear conflicting properties
                      delete updated.points;
                      delete updated.autoPoints;
                      // Use the original property (conversion will happen on save)
                      updated[originalPointsProperty] = numValue;
                      return updated;
                    });
                  }
                }}
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                The amount of points each attempt at the question is worth.
                {isPointsInherited() ? (
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
                value={getMaxAutoPointsDisplayValue()}
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value === '') {
                    // Clear to inherit
                    setLocalQuestion((prev) => {
                      const updated = { ...prev };
                      delete updated.maxAutoPoints;
                      delete updated.maxPoints;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
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
                {isMaxPointsInherited() ? (
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
                      const updated = { ...prev };
                      delete updated.manualPoints;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => ({
                      ...prev,
                      manualPoints: numValue,
                    }));
                  }
                }}
              />
              <small id="manualPointsHelp" class="form-text text-muted">
                The amount of points possible from manual grading.
                {isInherited('manualPoints') ? (
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
                      const updated = { ...prev };
                      delete updated.triesPerVariant;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => ({ ...prev, triesPerVariant: numValue }));
                  }
                }}
              />
              <small id="triesPerVariantHelp" class="form-text text-muted">
                This is the number of attempts a student has to answer the question before getting a
                new variant.
                {isInherited('triesPerVariant') ? (
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
                value={
                  // Check autoPoints first if we have manual points (since points + manualPoints can't coexist)
                  localQuestion.manualPoints !== undefined
                    ? typeof localQuestion.autoPoints === 'string'
                      ? localQuestion.autoPoints
                      : formatAutoPoints(localQuestion.autoPoints)
                    : typeof localQuestion[originalPointsProperty] === 'string'
                      ? localQuestion[originalPointsProperty]
                      : formatAutoPoints(localQuestion.points ?? localQuestion.autoPoints)
                }
                onChange={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setLocalQuestion((prev) => {
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
                }}
              />
              <small id="autoPointsHelp" class="form-text text-muted">
                This is a list of points that each attempt at the question is worth. Enter values
                separated by commas.
                {isPointsInherited() ? (
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
                      const updated = { ...prev };
                      delete updated.manualPoints;
                      return updated;
                    });
                  } else {
                    const numValue = (e.target as HTMLInputElement).valueAsNumber;
                    setLocalQuestion((prev) => {
                      const updated = { ...prev };
                      // For exams, manual points can coexist with autoPoints but NOT with points
                      // So if we have 'points' set, we need to convert it to 'autoPoints'
                      if (updated.points !== undefined) {
                        updated.autoPoints = updated.points;
                        delete updated.points;
                      }
                      updated.manualPoints = numValue;
                      return updated;
                    });
                  }
                }}
              />
              <small id="manualPointsHelp" class="form-text text-muted">
                The amount of points possible from manual grading.
                {isInherited('manualPoints') ? (
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
                const parsedValue = parseAutoPointsForSave(pointsValue);
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
          {addQuestion ? 'Add question' : 'Update question'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
