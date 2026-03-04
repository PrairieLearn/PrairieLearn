import clsx from 'clsx';
import { useRef } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import type { QuestionByQidResult } from '../trpc.js';
import type { QuestionAlternativeForm, ZoneQuestionBlockForm } from '../types.js';
import { validatePositiveInteger } from '../utils/questions.js';
import { useTRPCClient } from '../utils/trpc-context.js';

type EditQuestionModalData =
  | {
      type: 'create';
      question: ZoneQuestionBlockForm | QuestionAlternativeForm;
      zoneQuestionBlock?: ZoneQuestionBlockForm;
      existingQids: string[];
    }
  | {
      type: 'edit';
      question: ZoneQuestionBlockForm | QuestionAlternativeForm;
      zoneQuestionBlock?: ZoneQuestionBlockForm;
      originalQuestionId?: string;
    };

function isInherited(
  fieldName: keyof ZoneQuestionBlockForm & keyof QuestionAlternativeForm,
  isAlternative: boolean,
  question: ZoneQuestionBlockForm | QuestionAlternativeForm,
  zoneQuestionBlock?: ZoneQuestionBlockForm,
): boolean {
  if (!isAlternative || !zoneQuestionBlock) return false;
  return (
    (!(fieldName in question) || question[fieldName] === undefined) &&
    fieldName in zoneQuestionBlock &&
    zoneQuestionBlock[fieldName] !== undefined
  );
}

type PointValue = number | number[] | undefined;

function valuesAreEqual(a: PointValue, b: PointValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }
  return false;
}

export function EditQuestionModal({
  show,
  data,
  /** Called when the modal should close. */
  onHide,
  /** Saves the question with updated form data and optional new question metadata. */
  handleUpdateQuestion,
  assessmentType,
  /** Opens the question picker, passing current form values to preserve edits. */
  onPickQuestion,
  /** Reopens the picker for the same zone after adding a question. */
  onAddAndPickAnother,
}: {
  show: boolean;
  data: EditQuestionModalData | null;
  onHide: () => void;
  handleUpdateQuestion: (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    newQuestionData: QuestionByQidResult | undefined,
  ) => void;
  assessmentType: 'Homework' | 'Exam';
  onPickQuestion?: (currentFormValues: ZoneQuestionBlockForm | QuestionAlternativeForm) => void;
  onAddAndPickAnother?: () => void;
}) {
  const trpcClient = useTRPCClient();
  const submitActionRef = useRef<'save' | 'save-and-pick'>('save');

  const type = data?.type ?? null;
  const question = data?.question ?? null;
  const zoneQuestionBlock = data?.zoneQuestionBlock;
  const existingQids = data?.type === 'create' ? data.existingQids : [];
  const originalQuestionId = data?.type === 'edit' ? data.originalQuestionId : undefined;
  const isAlternative = !!zoneQuestionBlock;

  const manualPointsDisplayValue =
    question?.manualPoints ?? zoneQuestionBlock?.manualPoints ?? null;

  const originalPointsProperty = run(() => {
    if (question?.points != null) return 'points';
    if (question?.autoPoints != null) return 'autoPoints';
    if (zoneQuestionBlock) {
      if (zoneQuestionBlock.points != null) {
        return 'points';
      }
      if (zoneQuestionBlock.autoPoints != null) {
        return 'autoPoints';
      }
    }
    return 'autoPoints';
  });

  const originalMaxProperty = run(() => {
    if (question?.maxAutoPoints != null) return 'maxAutoPoints';
    if (question?.maxPoints != null) return 'maxPoints';

    if (zoneQuestionBlock) {
      if (zoneQuestionBlock.maxAutoPoints != null) {
        return 'maxAutoPoints';
      }
      if (zoneQuestionBlock.maxPoints != null) {
        return 'maxPoints';
      }
    }
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  });

  const isPointsInherited = question
    ? isInherited('points', isAlternative, question, zoneQuestionBlock)
    : false;
  const isMaxPointsInherited = question
    ? isInherited(originalMaxProperty, isAlternative, question, zoneQuestionBlock)
    : false;

  const autoPointsDisplayValue = isPointsInherited
    ? zoneQuestionBlock?.[originalPointsProperty]
    : (question?.[originalPointsProperty] ?? undefined);

  const maxAutoPointsDisplayValue = isMaxPointsInherited
    ? zoneQuestionBlock?.[originalMaxProperty]
    : (question?.[originalMaxProperty] ?? null);

  const originalInheritedValues = run(() => {
    return {
      [originalPointsProperty]: isPointsInherited
        ? zoneQuestionBlock?.[originalPointsProperty]
        : undefined,
      [originalMaxProperty]: isMaxPointsInherited
        ? zoneQuestionBlock?.[originalMaxProperty]
        : undefined,
      manualPoints:
        question && isInherited('manualPoints', isAlternative, question, zoneQuestionBlock)
          ? zoneQuestionBlock?.manualPoints
          : undefined,
    };
  });

  const formValues = run(() => question ?? ({ trackingId: '' } as ZoneQuestionBlockForm));

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ZoneQuestionBlockForm | QuestionAlternativeForm>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: formValues,
  });

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add question' : 'Edit question'}</Modal.Title>
      </Modal.Header>
      {question && (
        <form
          onSubmit={handleSubmit(async (formData) => {
            const action: 'save' | 'save-and-pick' = submitActionRef.current;
            submitActionRef.current = 'save';

            let questionData: QuestionByQidResult | undefined;
            if (type === 'create' || formData.id !== (originalQuestionId ?? question.id)) {
              try {
                questionData = await trpcClient.questionByQid.query({ qid: formData.id! });
              } catch {
                setError('id', { message: 'Question not found' });
                return;
              }
            }

            const filteredData = { ...formData };

            if (
              originalInheritedValues[originalPointsProperty] !== undefined &&
              valuesAreEqual(
                filteredData[originalPointsProperty],
                originalInheritedValues[originalPointsProperty],
              )
            ) {
              delete filteredData[originalPointsProperty];
            }

            if (
              originalInheritedValues[originalMaxProperty] !== undefined &&
              valuesAreEqual(
                filteredData[originalMaxProperty],
                originalInheritedValues[originalMaxProperty],
              )
            ) {
              delete filteredData[originalMaxProperty];
            }

            if (
              originalInheritedValues.manualPoints !== undefined &&
              valuesAreEqual(filteredData.manualPoints, originalInheritedValues.manualPoints)
            ) {
              delete filteredData.manualPoints;
            }

            const dataWithTrackingId = {
              ...filteredData,
              trackingId: question.trackingId,
            };

            handleUpdateQuestion(
              dataWithTrackingId as ZoneQuestionBlockForm | QuestionAlternativeForm,
              questionData,
            );

            if (action === 'save-and-pick') {
              onAddAndPickAnother?.();
            }
          })}
        >
          <Modal.Body>
            <div className="mb-3">
              <label htmlFor="qid-input">QID</label>
              <div className="input-group">
                <input
                  type="text"
                  className={clsx('form-control', errors.id && 'is-invalid')}
                  id="qid-input"
                  aria-invalid={!!errors.id}
                  aria-errormessage={errors.id ? 'qid-error' : undefined}
                  aria-describedby="qid-help"
                  readOnly={onPickQuestion != null}
                  {...register('id', {
                    required: 'QID is required',
                    validate: (qid) => {
                      if (!qid) return 'QID is required';
                      if (qid !== question.id && existingQids.includes(qid)) {
                        return 'QID already exists in the assessment';
                      }
                      return true;
                    },
                  })}
                />
                {onPickQuestion && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => onPickQuestion(getValues())}
                  >
                    Pick
                  </button>
                )}
                {errors.id && (
                  <div id="qid-error" className="invalid-feedback">
                    {errors.id.message}
                  </div>
                )}
              </div>
              <small id="qid-help" className="form-text text-muted">
                The unique identifier for the question.
              </small>
            </div>
            {assessmentType === 'Homework' ? (
              <>
                <div className="mb-3">
                  <label htmlFor="auto-points-input">Auto points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors[originalPointsProperty] && 'is-invalid')}
                    id="auto-points-input"
                    step="any"
                    aria-invalid={!!errors[originalPointsProperty]}
                    aria-errormessage={
                      errors[originalPointsProperty] ? 'auto-points-error' : undefined
                    }
                    aria-describedby="auto-points-help"
                    {...register(originalPointsProperty, {
                      value: autoPointsDisplayValue ?? undefined,
                      setValueAs: (value) => {
                        if (value === '') return undefined;
                        return Number(value);
                      },
                      validate: (value, { manualPoints }) => {
                        if (manualPoints === undefined && value === undefined) {
                          return 'At least one of auto points or manual points must be set.';
                        }
                      },
                    })}
                  />
                  {errors[originalPointsProperty] && (
                    <div id="auto-points-error" className="invalid-feedback">
                      {errors[originalPointsProperty].message}
                    </div>
                  )}
                  <small id="auto-points-help" className="form-text text-muted">
                    The number of points each attempt at the question is worth.
                    {isInherited(
                      originalPointsProperty,
                      isAlternative,
                      question,
                      zoneQuestionBlock,
                    ) ? (
                      <>
                        {' '}
                        <em>(Inherited from alternative group)</em>
                      </>
                    ) : null}
                  </small>
                </div>
                <div className="mb-3">
                  <label htmlFor="max-auto-points-input">Max auto points</label>
                  <input
                    type="number"
                    className="form-control"
                    id="max-auto-points-input"
                    aria-describedby="max-points-help"
                    {...register(originalMaxProperty, {
                      value: maxAutoPointsDisplayValue ?? undefined,
                      setValueAs: (value) => {
                        if (value === '') return undefined;
                        return Number(value);
                      },
                    })}
                  />
                  <small id="max-points-help" className="form-text text-muted">
                    The maximum number of points that can be awarded for the question.
                    {isInherited(
                      originalMaxProperty,
                      isAlternative,
                      question,
                      zoneQuestionBlock,
                    ) ? (
                      <>
                        {' '}
                        <em>(Inherited from alternative group)</em>
                      </>
                    ) : null}
                  </small>
                </div>
                <div className="mb-3">
                  <label htmlFor="manual-points-input">Manual points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                    aria-invalid={!!errors.manualPoints}
                    aria-errormessage={errors.manualPoints ? 'manual-points-error' : undefined}
                    aria-describedby="manual-points-help"
                    id="manual-points-input"
                    {...register('manualPoints', {
                      value: manualPointsDisplayValue ?? undefined,
                      setValueAs: (value) => {
                        if (value === '') return undefined;
                        return Number(value);
                      },
                      validate: (value, { autoPoints, points }) => {
                        if (
                          points === undefined &&
                          autoPoints === undefined &&
                          value === undefined
                        ) {
                          return 'At least one of auto points or manual points must be set.';
                        }
                      },
                    })}
                  />
                  {errors.manualPoints && (
                    <div id="manual-points-error" className="invalid-feedback">
                      {errors.manualPoints.message}
                    </div>
                  )}
                  <small id="manual-points-help" className="form-text text-muted">
                    The number of points possible from manual grading.
                    {isInherited('manualPoints', isAlternative, question, zoneQuestionBlock) ? (
                      <>
                        {' '}
                        <em>(Inherited from alternative group)</em>
                      </>
                    ) : null}
                  </small>
                </div>
                <div className="mb-3">
                  <label htmlFor="tries-per-variant-input">Tries Per Variant</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.triesPerVariant && 'is-invalid')}
                    aria-invalid={!!errors.triesPerVariant}
                    aria-errormessage={
                      errors.triesPerVariant ? 'tries-per-variant-error' : undefined
                    }
                    aria-describedby="tries-per-variant-help"
                    id="tries-per-variant-input"
                    {...register('triesPerVariant', {
                      value: Number(question.triesPerVariant ?? 1),
                      setValueAs: (value) => {
                        if (value === '') {
                          return 1;
                        }
                        return Number(value);
                      },
                      validate: (value) => validatePositiveInteger(value, 'Tries per variant'),
                    })}
                  />
                  {errors.triesPerVariant && (
                    <div id="tries-per-variant-error" className="invalid-feedback">
                      {errors.triesPerVariant.message}
                    </div>
                  )}
                  <small id="tries-per-variant-help" className="form-text text-muted">
                    This is the number of attempts a student has to answer the question before
                    getting a new variant.
                  </small>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label htmlFor="auto-points-input">Points list</label>
                  <input
                    type="text"
                    className={clsx(
                      'form-control points-list',
                      errors[originalPointsProperty] && 'is-invalid',
                    )}
                    aria-invalid={!!errors[originalPointsProperty]}
                    aria-errormessage={
                      errors[originalPointsProperty] ? 'points-list-error' : undefined
                    }
                    aria-describedby="auto-points-help"
                    id="auto-points-input"
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
                    <div id="points-list-error" className="invalid-feedback">
                      {errors[originalPointsProperty].message}
                    </div>
                  )}
                  <small id="auto-points-help" className="form-text text-muted">
                    This is a list of points that each attempt at the question is worth. Enter
                    values separated by commas.
                    {isInherited(
                      originalPointsProperty,
                      isAlternative,
                      question,
                      zoneQuestionBlock,
                    ) ? (
                      <>
                        {' '}
                        <em>(Inherited from alternative group)</em>
                      </>
                    ) : null}
                  </small>
                </div>
                <div className="mb-3">
                  <label htmlFor="manual-points-input">Manual points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                    aria-invalid={!!errors.manualPoints}
                    aria-errormessage={errors.manualPoints ? 'manual-points-error' : undefined}
                    aria-describedby="manual-points-help"
                    id="manual-points-input"
                    {...register('manualPoints', {
                      value: manualPointsDisplayValue ?? undefined,
                      setValueAs: (value) => {
                        if (value === '') return undefined;
                        return Number(value);
                      },
                      validate: (value, { autoPoints, points }) => {
                        if (
                          points === undefined &&
                          autoPoints === undefined &&
                          value === undefined
                        ) {
                          return 'At least one of auto points or manual points must be set.';
                        }
                      },
                    })}
                  />
                  {errors.manualPoints && (
                    <div id="manual-points-error" className="invalid-feedback">
                      {errors.manualPoints.message}
                    </div>
                  )}
                  <small id="manual-points-help" className="form-text text-muted">
                    The number of points possible from manual grading.
                    {isInherited('manualPoints', isAlternative, question, zoneQuestionBlock) ? (
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
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSubmitting}
              onClick={onHide}
            >
              Close
            </button>
            {type === 'create' && onAddAndPickAnother && (
              <button
                type="submit"
                className="btn btn-outline-primary"
                disabled={isSubmitting}
                onClick={() => {
                  submitActionRef.current = 'save-and-pick';
                }}
              >
                {isSubmitting ? 'Adding...' : 'Add & pick another'}
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              onClick={() => {
                submitActionRef.current = 'save';
              }}
            >
              {isSubmitting
                ? type === 'create'
                  ? 'Adding...'
                  : 'Updating...'
                : type === 'create'
                  ? 'Add question'
                  : 'Update question'}
            </button>
          </Modal.Footer>
        </form>
      )}
    </Modal>
  );
}
