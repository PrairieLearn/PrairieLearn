import { Modal } from 'react-bootstrap';

import { useState, useEffect } from '@prairielearn/preact-cjs/hooks';
import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

export function EditQuestionModal({
  question,
  alternativeGroup,
  showEditModal,
  onHide,
  handleUpdateQuestion,
  assessmentType,
  questionDisplayName,
  addQuestion,
}: {
  question: ZoneQuestionJson | QuestionAlternativeJson;
  alternativeGroup?: ZoneQuestionJson | null;
  showEditModal: boolean;
  onHide: () => void;
  handleUpdateQuestion: (updatedQuestion: any, gradingMethod?: 'auto' | 'manual') => void;
  assessmentType: 'Homework' | 'Exam';
  questionDisplayName: string;
  addQuestion?: boolean;
}) {
  // Helper to get the effective value (own value or inherited from group)
  const getEffectiveValue = <T,>(
    ownValue: T | undefined,
    groupValue: T | undefined,
  ): T | undefined => {
    return ownValue !== undefined ? ownValue : groupValue;
  };

  // Determine if we're editing an alternative (has a parent group)
  const isAlternative = !!alternativeGroup;

  // Determine which property was originally set for points (points vs autoPoints)
  // Check own values first, then inherited values
  const determineOriginalPointsProperty = (): 'points' | 'autoPoints' => {
    // Check own question first
    if (question.points !== undefined) return 'points';
    if (question.autoPoints !== undefined) return 'autoPoints';
    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup!.points !== undefined) return 'points';
      if (alternativeGroup!.autoPoints !== undefined) return 'autoPoints';
    }
    // Default to 'autoPoints' for homework, 'points' for exams
    return assessmentType === 'Exam' ? 'points' : 'autoPoints';
  };

  // Determine which max property was originally set for auto grading (maxPoints vs maxAutoPoints)
  // Prefer matching the points property (points → maxPoints, autoPoints → maxAutoPoints)
  const determineOriginalMaxProperty = (): 'maxPoints' | 'maxAutoPoints' => {
    const pointsProp = determineOriginalPointsProperty();

    // Check own question first
    if (question.maxAutoPoints !== undefined) return 'maxAutoPoints';
    if (question.maxPoints !== undefined) return 'maxPoints';

    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup!.maxAutoPoints !== undefined) return 'maxAutoPoints';
      if (alternativeGroup!.maxPoints !== undefined) return 'maxPoints';
    }

    // Default: match the points property
    return pointsProp === 'points' ? 'maxPoints' : 'maxAutoPoints';
  };

  const [originalPointsProperty] = useState<'points' | 'autoPoints'>(
    determineOriginalPointsProperty(),
  );

  const [originalMaxProperty] = useState<'maxPoints' | 'maxAutoPoints'>(
    determineOriginalMaxProperty(),
  );

  // Determine initial grading method based on manual points
  const effectiveManualPoints = getEffectiveValue(
    question.manualPoints,
    alternativeGroup?.manualPoints,
  );
  const [autoGraded, setAutoGraded] = useState(!effectiveManualPoints);
  const [localQuestion, setLocalQuestion] = useState<ZoneQuestionJson | QuestionAlternativeJson>(
    JSON.parse(JSON.stringify(question)),
  );
  const [localQuestionId, setLocalQuestionId] = useState(questionDisplayName);
  const [homeworkAutoPoints, setHomeworkAutoPoints] = useState<number>(
    localQuestion.points ?? localQuestion.autoPoints,
  );
  const [examAutoPoints, setExamAutoPoints] = useState<string | number>(getExamAutoPoints());
  if (!question) {
    return null;
  }

  function getExamAutoPoints() {
    if (assessmentType === 'Exam') {
      if (localQuestion.points && Array.isArray(localQuestion.points)) {
        return localQuestion.points.join(',');
      } else if (localQuestion.autoPoints && Array.isArray(localQuestion.autoPoints)) {
        return localQuestion.autoPoints.join(',');
      } else {
        return localQuestion.points ?? localQuestion.autoPoints ?? 0;
      }
    }
    return 0;
  }

  // Check if a value is inherited (only for alternatives)
  const isInherited = (fieldName: keyof ZoneQuestionJson | keyof QuestionAlternativeJson) => {
    if (!isAlternative) return false;
    return localQuestion[fieldName] === undefined && alternativeGroup![fieldName] !== undefined;
  };

  // Check if points/autoPoints is inherited (special case since we track which one to use)
  const isPointsInherited = () => {
    if (!isAlternative) return false;
    return (
      localQuestion[originalPointsProperty] === undefined &&
      alternativeGroup![originalPointsProperty] !== undefined
    );
  };

  // Format auto points for display (handles both single numbers and arrays)
  const formatAutoPoints = (value: number | number[] | undefined): string => {
    if (value === undefined) return '';
    if (Array.isArray(value)) return value.join(',');
    return String(value);
  };

  // Parse auto points from input (handles both single numbers and arrays)
  const parseAutoPoints = (value: string): number | number[] => {
    if (assessmentType === 'Exam') {
      // For exams, parse as array
      return value.split(',').map((v) => Number(v.trim()));
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
      const inheritedValue = alternativeGroup![originalPointsProperty];
      if (inheritedValue !== undefined) {
        return formatAutoPoints(inheritedValue);
      }
    }
    return '';
  };
  useEffect(() => {
    setLocalQuestion(JSON.parse(JSON.stringify(question)));
    setAutoGraded(!effectiveManualPoints);
  }, [question]);
  // Get the max auto points value to display (own or inherited)
  // Uses the originalMaxProperty to determine which field to check
  const getMaxAutoPointsDisplayValue = () => {
    const ownValue = localQuestion[originalMaxProperty];
    if (ownValue !== undefined) {
      return ownValue;
    }
    if (isAlternative) {
      const inheritedValue = alternativeGroup![originalMaxProperty];
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
      alternativeGroup![originalMaxProperty] !== undefined
    );
  };

  // const homeworkAutoPoints = () => {
  //   if (assessmentType === 'Homework') {
  //     return localQuestion.points ?? localQuestion.autoPoints;
  //   }
  //   return null;
  // };

  // const examAutoPoints = () => {
  //   if (assessmentType === 'Exam') {
  //     return localQuestion.points?.toString() ?? localQuestion.autoPoints?.toString();
  //   }
  //   return null;
  // };

  // const handleSave = async () => {
  //   if (localQuestion.id === question.id) {
  //     console.log('update');
  //   } else {
  //     const res = await fetch(`${window.location.pathname}/${localQuestion.id}`, {
  //       method: 'GET',
  //     });
  //     if (!res.ok) {
  //       throw new Error('Failed to save question');
  //     }
  //     const data = await res.json();
  //     console.log(data);
  //   }
  // };

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
              value={localQuestion.id}
              onChange={(e) => {
                const newId = (e.target as HTMLInputElement).value;
                setLocalQuestionId(newId);
                setLocalQuestion((prev) => ({ ...prev, id: newId }));
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
                value={autoGraded ? 'auto' : 'manual'}
                onChange={(e) => {
                  const isAuto = (e.target as HTMLSelectElement)?.value === 'auto';
                  setAutoGraded(isAuto);
                  // Clear opposing values when switching grading method for Homework
                  setLocalQuestion((prev) => {
                    const updated = { ...prev };
                    if (isAuto) {
                      // Switching to auto: clear manual points
                      delete updated.manualPoints;
                    } else {
                      // Switching to manual: clear auto points and max auto points
                      delete updated.points;
                      delete updated.autoPoints;
                      delete updated.maxPoints;
                      delete updated.maxAutoPoints;
                    }
                    return updated;
                  });
                }}
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
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
                        // Use the original property (points or autoPoints)
                        setLocalQuestion((prev) => {
                          const updated = { ...prev };
                          // Clear conflicting properties
                          delete updated.points;
                          delete updated.autoPoints;
                          delete updated.manualPoints;
                          // Set the one we're using
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
                        // Use the original max property
                        setLocalQuestion((prev) => {
                          const updated = { ...prev };
                          // Clear all max properties to avoid conflicts
                          delete updated.maxPoints;
                          delete updated.maxAutoPoints;
                          // Set the one we're using
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
                  <label for="triesPerVariantInput">Tries Per Variant</label>
                  <input
                    type="number"
                    class="form-control"
                    id="triesPerVariantInput"
                    name="triesPerVariant"
                    value={
                      localQuestion.triesPerVariant !== undefined
                        ? localQuestion.triesPerVariant
                        : isAlternative && alternativeGroup?.triesPerVariant !== undefined
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
                    This is the number of attempts a student has to answer the question before
                    getting a new variant.
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
                      : isAlternative && alternativeGroup?.manualPoints !== undefined
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
                        // Clear all conflicting properties for homework manual grading
                        delete updated.autoPoints;
                        delete updated.points;
                        delete updated.maxPoints;
                        delete updated.maxAutoPoints;
                        // Set manual points
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
                value={localQuestion.points ?? localQuestion.autoPoints ?? ''}
                onChange={(e) => {
                  setLocalQuestion((prev) => ({
                    ...prev,
                    points: parseAutoPoints((e.target as HTMLInputElement).value),
                  }));
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
                    : isAlternative && alternativeGroup?.manualPoints !== undefined
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
                      // For exams, manual points can coexist with auto points
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
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Close
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            handleUpdateQuestion(
              localQuestion,
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
