import clsx from 'clsx';
import { useMemo, useRef } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

export type EditQuestionModalState =
  | { type: 'closed' }
  | {
      type: 'create';
      question: ZoneQuestionJson | QuestionAlternativeJson;
      alternativeGroup?: ZoneQuestionJson;
      mappedQids: string[];
    }
  | {
      type: 'edit';
      question: ZoneQuestionJson | QuestionAlternativeJson;
      alternativeGroup?: ZoneQuestionJson;
    };

/**
 * Helper function to check if a value on an alternative question is inherited from the parent group.
 */
function isInherited(
  fieldName: keyof ZoneQuestionJson | keyof QuestionAlternativeJson,
  isAlternative: boolean,
  question: ZoneQuestionJson | QuestionAlternativeJson,
  alternativeGroup?: ZoneQuestionJson,
): boolean {
  if (!isAlternative || !alternativeGroup) return false;
  return (
    (!(fieldName in question) || question[fieldName as keyof typeof question] === undefined) &&
    fieldName in alternativeGroup &&
    alternativeGroup[fieldName as keyof typeof alternativeGroup] !== undefined
  );
}

/**
 * Helper function to compare two values, including arrays.
 */
function valuesAreEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }
  return false;
}

export function EditQuestionModal({
  editQuestionModalState,
  onHide,
  handleUpdateQuestion,
  assessmentType,
}: {
  editQuestionModalState: EditQuestionModalState;
  onHide: () => void;
  handleUpdateQuestion: (
    updatedQuestion: ZoneQuestionJson | QuestionAlternativeJson,
    newQuestionDataRef?: StaffAssessmentQuestionRow,
  ) => void;
  assessmentType: 'Homework' | 'Exam';
}) {
  const { type } = editQuestionModalState;
  const question = type !== 'closed' ? editQuestionModalState.question : null;
  const alternativeGroup = type !== 'closed' ? editQuestionModalState.alternativeGroup : undefined;
  const mappedQids = type === 'create' ? editQuestionModalState.mappedQids : [];
  const isAlternative = !!alternativeGroup;

  const manualPointsDisplayValue = question?.manualPoints ?? alternativeGroup?.manualPoints ?? null;
  const newQuestionDataRef = useRef<StaffAssessmentQuestionRow | undefined>(undefined);

  // Determine which property was originally set for points (points vs autoPoints)
  // Check own values first, then inherited values
  const originalPointsProperty = useMemo<'points' | 'autoPoints'>(() => {
    if (question?.points !== undefined) return 'points';
    if (question?.autoPoints !== undefined) return 'autoPoints';
    if (isAlternative) {
      if (alternativeGroup.points !== undefined) {
        return 'points';
      }
      if (alternativeGroup.autoPoints !== undefined) {
        return 'autoPoints';
      }
    }
    return 'autoPoints';
  }, [question, alternativeGroup, isAlternative]);

  const originalMaxProperty = useMemo<'maxPoints' | 'maxAutoPoints'>(() => {
    // Check own question first
    if (question?.maxAutoPoints !== undefined) return 'maxAutoPoints';
    if (question?.maxPoints !== undefined) return 'maxPoints';

    // Check inherited from alternative group
    if (isAlternative) {
      if (alternativeGroup.maxAutoPoints !== undefined) {
        return 'maxAutoPoints';
      }
      if (alternativeGroup.maxPoints !== undefined) {
        return 'maxPoints';
      }
    }
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  }, [question, alternativeGroup, isAlternative, originalPointsProperty]);

  const isPointsInherited = useMemo(
    () => (question ? isInherited('points', isAlternative, question, alternativeGroup) : false),
    [isAlternative, question, alternativeGroup],
  );
  const isMaxPointsInherited = useMemo(
    () =>
      question
        ? isInherited(originalMaxProperty, isAlternative, question, alternativeGroup)
        : false,
    [originalMaxProperty, isAlternative, question, alternativeGroup],
  );
  const autoPointsDisplayValue = isPointsInherited
    ? alternativeGroup?.[originalPointsProperty]
    : (question?.[originalPointsProperty] ?? undefined);

  const maxAutoPointsDisplayValue = isMaxPointsInherited
    ? alternativeGroup?.[originalMaxProperty]
    : (question?.[originalMaxProperty] ?? null);

  // Track the original inherited values so we can detect if they were modified
  const originalInheritedValues = useMemo(() => {
    return {
      [originalPointsProperty]: isPointsInherited
        ? alternativeGroup?.[originalPointsProperty]
        : undefined,
      [originalMaxProperty]: isMaxPointsInherited
        ? alternativeGroup?.[originalMaxProperty]
        : undefined,
      manualPoints:
        question && isInherited('manualPoints', isAlternative, question, alternativeGroup)
          ? alternativeGroup?.manualPoints
          : undefined,
    };
  }, [
    originalPointsProperty,
    originalMaxProperty,
    isPointsInherited,
    isMaxPointsInherited,
    isAlternative,
    question,
    alternativeGroup,
  ]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ZoneQuestionJson | QuestionAlternativeJson>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: question ?? {},
  });

  if (type === 'closed') return null;
  if (!question) return null;

  return (
    <Modal show={true} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add question' : 'Edit question'}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((data) => {
          // Filter out inherited values that were not modified
          const filteredData = { ...data };

          // Check if auto/points field was inherited and unchanged
          if (
            originalInheritedValues[originalPointsProperty] !== undefined &&
            valuesAreEqual(
              filteredData[originalPointsProperty],
              originalInheritedValues[originalPointsProperty],
            )
          ) {
            delete filteredData[originalPointsProperty];
          }

          // Check if max points field was inherited and unchanged
          if (
            originalInheritedValues[originalMaxProperty] !== undefined &&
            valuesAreEqual(
              filteredData[originalMaxProperty],
              originalInheritedValues[originalMaxProperty],
            )
          ) {
            delete filteredData[originalMaxProperty];
          }

          // Check if manual points was inherited and unchanged
          if (
            originalInheritedValues.manualPoints !== undefined &&
            valuesAreEqual(filteredData.manualPoints, originalInheritedValues.manualPoints)
          ) {
            delete filteredData.manualPoints;
          }

          handleUpdateQuestion(filteredData, newQuestionDataRef.current);
        })}
      >
        <Modal.Body>
          <div className="mb-3">
            <label htmlFor="qidInput">QID</label>
            <input
              type="text"
              className={clsx('form-control', errors.id && 'is-invalid')}
              id="qidInput"
              disabled={type !== 'create'}
              aria-invalid={errors.id ? 'true' : 'false'}
              {...register('id', {
                required: 'QID is required',
                validate: async (qid) => {
                  if (!qid) return 'QID is required';
                  if (qid !== question.id) {
                    if (mappedQids.includes(qid)) {
                      return 'QID already exists in the assessment';
                    }
                    const params = new URLSearchParams({ qid });
                    const res = await fetch(
                      `${window.location.pathname}/question.json?${params.toString()}`,
                      {
                        method: 'GET',
                      },
                    );
                    if (!res.ok) {
                      throw new Error('Failed to save question');
                    }
                    const questionData = await res.json();
                    if (questionData === null) {
                      return 'Question not found';
                    }
                    newQuestionDataRef.current = questionData;
                  }
                },
              })}
            />
            {errors.id && <div className="invalid-feedback">{errors.id.message}</div>}
            <small id="qidHelp" className="form-text text-muted">
              The unique identifier for the question.
            </small>
          </div>
          {assessmentType === 'Homework' ? (
            <>
              <div className="mb-3">
                <label htmlFor="autoPointsInput">Auto Points</label>
                <input
                  type="number"
                  className={clsx('form-control', errors.autoPoints && 'is-invalid')}
                  id="autoPointsInput"
                  step="any"
                  aria-invalid={errors.autoPoints ? 'true' : 'false'}
                  {...register(originalPointsProperty, {
                    value: autoPointsDisplayValue ?? undefined,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                    validate: (value, { manualPoints }) => {
                      if (!manualPoints && value === undefined) {
                        return 'At least one of auto points or manual points must be set.';
                      }
                    },
                  })}
                />
                {errors[originalPointsProperty] && (
                  <div className="invalid-feedback">{errors[originalPointsProperty].message}</div>
                )}
                <small id="autoPointsHelp" className="form-text text-muted">
                  The amount of points each attempt at the question is worth.
                  {isInherited(
                    originalPointsProperty,
                    isAlternative,
                    question,
                    alternativeGroup,
                  ) ? (
                    <>
                      {' '}
                      <em>(Inherited from alternative group)</em>
                    </>
                  ) : null}
                </small>
              </div>
              <div className="mb-3">
                <label htmlFor="maxAutoPointsInput">Max Auto Points</label>
                <input
                  type="number"
                  className="form-control"
                  id="maxAutoPointsInput"
                  {...register(originalMaxProperty, {
                    value: maxAutoPointsDisplayValue ?? undefined,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                  })}
                />
                <small id="maxPointsHelp" className="form-text text-muted">
                  The maximum number of points that can be awarded for the question.
                  {isInherited(originalMaxProperty, isAlternative, question, alternativeGroup) ? (
                    <>
                      {' '}
                      <em>(Inherited from alternative group)</em>
                    </>
                  ) : null}
                </small>
              </div>
              <div className="mb-3">
                <label htmlFor="manualPointsInput">Manual Points</label>
                <input
                  type="number"
                  className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                  aria-invalid={errors.manualPoints ? 'true' : 'false'}
                  id="manualPointsInput"
                  {...register('manualPoints', {
                    value: manualPointsDisplayValue ?? undefined,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                    validate: (value, { autoPoints, points }) => {
                      if (!points && !autoPoints && value === undefined) {
                        return 'At least one of auto points or manual points must be set.';
                      }
                    },
                  })}
                />
                {errors.manualPoints && (
                  <div className="invalid-feedback">{errors.manualPoints.message}</div>
                )}
                <small id="manualPointsHelp" className="form-text text-muted">
                  The amount of points possible from manual grading.
                  {isInherited('manualPoints', isAlternative, question, alternativeGroup) ? (
                    <>
                      {' '}
                      <em>(Inherited from alternative group)</em>
                    </>
                  ) : null}
                </small>
              </div>
              <div className="mb-3">
                <label htmlFor="triesPerVariantInput">Tries Per Variant</label>
                <input
                  type="number"
                  className={clsx('form-control', errors.triesPerVariant && 'is-invalid')}
                  aria-invalid={errors.triesPerVariant ? 'true' : 'false'}
                  id="triesPerVariantInput"
                  {...register('triesPerVariant', {
                    value: Number(question.triesPerVariant ?? 1),
                    setValueAs: (value) => {
                      if (value === '') {
                        return 1;
                      }
                      return Number(value);
                    },
                    validate: (triesPerVariant) => {
                      if (!Number.isInteger(triesPerVariant)) {
                        return 'Tries per variant must be an integer';
                      }
                      if (triesPerVariant !== undefined && triesPerVariant < 1) {
                        return 'Tries per variant must be at least 1.';
                      }
                    },
                  })}
                />
                {errors.triesPerVariant && (
                  <div className="invalid-feedback">{errors.triesPerVariant.message}</div>
                )}
                <small id="triesPerVariantHelp" className="form-text text-muted">
                  This is the number of attempts a student has to answer the question before getting
                  a new variant.
                </small>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3">
                <label htmlFor="autoPoints">Points List</label>
                <input
                  type="text"
                  className={clsx(
                    'form-control points-list',
                    errors[originalPointsProperty] && 'is-invalid',
                  )}
                  aria-invalid={errors[originalPointsProperty] ? 'true' : 'false'}
                  id="autoPointsInput"
                  {...register(originalPointsProperty, {
                    value: autoPointsDisplayValue,
                    pattern: {
                      value: /^[0-9, ]*$/,
                      message: 'Points must be a number or a comma-separated list of numbers.',
                    },
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      if (!Number.isNaN(Number(value))) {
                        return Number(value);
                      }
                      if (value.includes(',')) {
                        return value
                          .split(',')
                          .map((v: string) => Number(v.trim()))
                          .filter((v: number) => !Number.isNaN(v));
                      }
                      return value;
                    },
                    validate: (value, { manualPoints }) => {
                      if (value === undefined && manualPoints === undefined) {
                        return 'At least one of auto points or manual points must be set.';
                      }
                    },
                  })}
                />
                {errors[originalPointsProperty] && (
                  <div className="invalid-feedback">{errors[originalPointsProperty].message}</div>
                )}
                <small id="autoPointsHelp" className="form-text text-muted">
                  This is a list of points that each attempt at the question is worth. Enter values
                  separated by commas.
                  {isInherited(
                    originalPointsProperty,
                    isAlternative,
                    question,
                    alternativeGroup,
                  ) ? (
                    <>
                      {' '}
                      <em>(Inherited from alternative group)</em>
                    </>
                  ) : null}
                </small>
              </div>
              <div className="mb-3">
                <label htmlFor="manualPoints">Manual Points</label>
                <input
                  type="number"
                  className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                  aria-invalid={errors.manualPoints ? 'true' : 'false'}
                  id="manualPointsInput"
                  {...register('manualPoints', {
                    value: manualPointsDisplayValue ?? undefined,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                    validate: (value, { autoPoints, points }) => {
                      if (points === undefined && autoPoints === undefined && value === undefined) {
                        return 'At least one of auto points or manual points must be set.';
                      }
                    },
                  })}
                />
                {errors.manualPoints && (
                  <div className="invalid-feedback">{errors.manualPoints.message}</div>
                )}
                <small id="manualPointsHelp" className="form-text text-muted">
                  The amount of points possible from manual grading.
                  {isInherited('manualPoints', isAlternative, question, alternativeGroup) ? (
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
          <button type="submit" className="btn btn-primary">
            {type === 'create' ? 'Add question' : 'Update question'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
