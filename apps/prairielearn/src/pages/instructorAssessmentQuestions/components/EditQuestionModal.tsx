import clsx from 'clsx';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { useMemo, useRef, useState } from '@prairielearn/preact-cjs/hooks';

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
    newQuestionData?: StaffAssessmentQuestionRow,
  ) => void;
  assessmentType: 'Homework' | 'Exam';
}) {
  const { type } = editQuestionModalState;
  const question = type !== 'closed' ? editQuestionModalState.question : null;
  const alternativeGroup = type !== 'closed' ? editQuestionModalState.alternativeGroup : undefined;
  const mappedQids = type === 'create' ? editQuestionModalState.mappedQids : [];
  const isAlternative = !!alternativeGroup;
  const [isPointsInherited, setIsPointsInherited] = useState(false);
  const [isMaxPointsInherited, setIsMaxPointsInherited] = useState(false);
  const autoPointsDisplayValue =
    question?.points ??
    question?.autoPoints ??
    alternativeGroup?.points ??
    alternativeGroup?.autoPoints ??
    undefined;

  const manualPointsDisplayValue = question?.manualPoints ?? alternativeGroup?.manualPoints ?? null;
  const newQuestionData = useRef<StaffAssessmentQuestionRow | undefined>(undefined);

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
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  }, [question, alternativeGroup, isAlternative, originalPointsProperty]);

  const maxAutoPointsDisplayValue =
    question?.[originalMaxProperty] ?? alternativeGroup?.[originalMaxProperty] ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ZoneQuestionJson | QuestionAlternativeJson>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: question!,
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
          handleUpdateQuestion(data, newQuestionData.current);
        })}
      >
        <Modal.Body>
          <div class="mb-3">
            <label for="qidInput">QID</label>
            <input
              type="text"
              class={clsx('form-control', errors.id && 'is-invalid')}
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
                    newQuestionData.current = questionData;
                  }
                },
              })}
            />
            {errors.id && <div class="invalid-feedback">{errors.id.message}</div>}
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
                  class={clsx('form-control', errors.autoPoints && 'is-invalid')}
                  id="autoPointsInput"
                  step="any"
                  aria-invalid={errors.autoPoints ? 'true' : 'false'}
                  {...register(originalPointsProperty, {
                    value: autoPointsDisplayValue,
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
                  <div class="invalid-feedback">{errors[originalPointsProperty].message}</div>
                )}
                <small id="autoPointsHelp" class="form-text text-muted">
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
              <div class="mb-3">
                <label for="maxAutoPointsInput">Max Auto Points</label>
                <input
                  type="number"
                  class="form-control"
                  id="maxAutoPointsInput"
                  {...register(originalMaxProperty, {
                    value: maxAutoPointsDisplayValue ?? undefined,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                  })}
                />
                <small id="maxPointsHelp" class="form-text text-muted">
                  The maximum number of points that can be awarded for the question.
                  {isInherited(originalMaxProperty, isAlternative, question, alternativeGroup) ? (
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
                  class={clsx('form-control', errors.manualPoints && 'is-invalid')}
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
                  <div class="invalid-feedback">{errors.manualPoints.message}</div>
                )}
                <small id="manualPointsHelp" class="form-text text-muted">
                  The amount of points possible from manual grading.
                  {isInherited('manualPoints', isAlternative, question, alternativeGroup) ? (
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
                  class={clsx('form-control', errors.triesPerVariant && 'is-invalid')}
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
                  <div class="invalid-feedback">{errors.triesPerVariant.message}</div>
                )}
                <small id="triesPerVariantHelp" class="form-text text-muted">
                  This is the number of attempts a student has to answer the question before getting
                  a new variant.
                </small>
              </div>
            </>
          ) : (
            <>
              <div class="mb-3">
                <label for="autoPoints">Points List</label>
                <input
                  type="text"
                  class={clsx(
                    'form-control points-list',
                    errors[originalPointsProperty] && 'is-invalid',
                  )}
                  aria-invalid={errors[originalPointsProperty] ? 'true' : 'false'}
                  id="autoPointsInput"
                  // pattern="^[0-9, ]*$"
                  // value={autoPointsDisplayValue}
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
                          .map((v) => Number(v.trim()))
                          .filter((v) => !Number.isNaN(v));
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
                  <div class="invalid-feedback">{errors[originalPointsProperty].message}</div>
                )}
                <small id="autoPointsHelp" class="form-text text-muted">
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
              <div class="mb-3">
                <label for="manualPoints">Manual Points</label>
                <input
                  type="number"
                  class={clsx('form-control', errors.manualPoints && 'is-invalid')}
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
                  <div class="invalid-feedback">{errors.manualPoints.message}</div>
                )}
                <small id="manualPointsHelp" class="form-text text-muted">
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
          <button type="button" class="btn btn-secondary" onClick={onHide}>
            Close
          </button>
          <button type="submit" class="btn btn-primary">
            {type === 'create' ? 'Add question' : 'Update question'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
