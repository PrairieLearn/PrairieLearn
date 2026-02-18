import clsx from 'clsx';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import type { QuestionByQidResult } from '../trpc.js';
import type { QuestionAlternativeForm, ZoneQuestionBlockForm } from '../types.js';
import { validatePositiveInteger } from '../utils/questions.js';
import type { AssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';

export type EditQuestionModalData =
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

/**
 * Helper function to compare two point values, including arrays.
 */
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
  onHide,
  onExited,
  handleUpdateQuestion,
  assessmentType,
  onPickQuestion,
  onAddAndPickAnother,
  trpcClient,
}: {
  show: boolean;
  data: EditQuestionModalData | null;
  onHide: () => void;
  onExited?: () => void;
  handleUpdateQuestion: (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    newQuestionData: QuestionByQidResult | undefined,
  ) => void;
  assessmentType: 'Homework' | 'Exam';
  onPickQuestion?: (currentFormValues: ZoneQuestionBlockForm | QuestionAlternativeForm) => void;
  onAddAndPickAnother?: () => void;
  trpcClient: AssessmentQuestionsTrpcClient;
}) {
  const type = data?.type ?? null;
  const question = data?.question ?? null;
  const zoneQuestionBlock = data?.zoneQuestionBlock;
  const existingQids = data?.type === 'create' ? data.existingQids : [];
  const originalQuestionId = data?.type === 'edit' ? data.originalQuestionId : undefined;
  const isAlternative = !!zoneQuestionBlock;

  const manualPointsDisplayValue =
    question?.manualPoints ?? zoneQuestionBlock?.manualPoints ?? null;

  // Determine which property was originally set (points vs autoPoints)
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

  // Determine which property was originally set (maxPoints vs maxAutoPoints)
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

  // Track the original inherited values so we can detect if they were modified
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
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add question' : 'Edit question'}</Modal.Title>
      </Modal.Header>
      {question && (
        <form
          onSubmit={handleSubmit(async (formData) => {
            // Fetch question data if creating a new question or if QID changed
            let questionData: QuestionByQidResult | undefined;
            if (type === 'create' || formData.id !== (originalQuestionId ?? question.id)) {
              try {
                questionData = await trpcClient.questionByQid.query({ qid: formData.id! });
              } catch {
                setError('id', { message: 'Question not found' });
                return;
              }
            }

            // Filter out inherited values that were not modified
            const filteredData = { ...formData };

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

            // Preserve the trackingId from the original question
            const dataWithTrackingId = {
              ...filteredData,
              trackingId: question.trackingId,
            };

            handleUpdateQuestion(
              dataWithTrackingId as ZoneQuestionBlockForm | QuestionAlternativeForm,
              questionData,
            );
          })}
        >
          <Modal.Body>
            <div className="mb-3">
              <label htmlFor="qidInput">QID</label>
              <div className="input-group">
                <input
                  type="text"
                  className={clsx('form-control', errors.id && 'is-invalid')}
                  id="qidInput"
                  aria-invalid={!!errors.id}
                  aria-errormessage={errors.id ? 'qidError' : undefined}
                  aria-describedby="qidHelp"
                  readOnly
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
                  <div id="qidError" className="invalid-feedback">
                    {errors.id.message}
                  </div>
                )}
              </div>
              <small id="qidHelp" className="form-text text-muted">
                The unique identifier for the question.
              </small>
            </div>
            {assessmentType === 'Homework' ? (
              <>
                <div className="mb-3">
                  <label htmlFor="autoPointsInput">Auto points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors[originalPointsProperty] && 'is-invalid')}
                    id="autoPointsInput"
                    step="any"
                    aria-invalid={!!errors[originalPointsProperty]}
                    aria-errormessage={
                      errors[originalPointsProperty] ? 'autoPointsError' : undefined
                    }
                    aria-describedby="autoPointsHelp"
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
                    <div id="autoPointsError" className="invalid-feedback">
                      {errors[originalPointsProperty].message}
                    </div>
                  )}
                  <small id="autoPointsHelp" className="form-text text-muted">
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
                  <label htmlFor="maxAutoPointsInput">Max auto points</label>
                  <input
                    type="number"
                    className="form-control"
                    id="maxAutoPointsInput"
                    aria-describedby="maxPointsHelp"
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
                  <label htmlFor="manualPointsInput">Manual points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                    aria-invalid={!!errors.manualPoints}
                    aria-errormessage={errors.manualPoints ? 'manualPointsError' : undefined}
                    aria-describedby="manualPointsHelp"
                    id="manualPointsInput"
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
                    <div id="manualPointsError" className="invalid-feedback">
                      {errors.manualPoints.message}
                    </div>
                  )}
                  <small id="manualPointsHelp" className="form-text text-muted">
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
                  <label htmlFor="triesPerVariantInput">Tries Per Variant</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.triesPerVariant && 'is-invalid')}
                    aria-invalid={!!errors.triesPerVariant}
                    aria-errormessage={errors.triesPerVariant ? 'triesPerVariantError' : undefined}
                    aria-describedby="triesPerVariantHelp"
                    id="triesPerVariantInput"
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
                    <div id="triesPerVariantError" className="invalid-feedback">
                      {errors.triesPerVariant.message}
                    </div>
                  )}
                  <small id="triesPerVariantHelp" className="form-text text-muted">
                    This is the number of attempts a student has to answer the question before
                    getting a new variant.
                  </small>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label htmlFor="autoPointsInput">Points list</label>
                  <input
                    type="text"
                    className={clsx(
                      'form-control points-list',
                      errors[originalPointsProperty] && 'is-invalid',
                    )}
                    aria-invalid={!!errors[originalPointsProperty]}
                    aria-errormessage={
                      errors[originalPointsProperty] ? 'pointsListError' : undefined
                    }
                    aria-describedby="autoPointsHelp"
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
                    <div id="pointsListError" className="invalid-feedback">
                      {errors[originalPointsProperty].message}
                    </div>
                  )}
                  <small id="autoPointsHelp" className="form-text text-muted">
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
                  <label htmlFor="manualPointsInput">Manual points</label>
                  <input
                    type="number"
                    className={clsx('form-control', errors.manualPoints && 'is-invalid')}
                    aria-invalid={!!errors.manualPoints}
                    aria-errormessage={errors.manualPoints ? 'manualPointsError' : undefined}
                    aria-describedby="manualPointsHelp"
                    id="manualPointsInput"
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
                    <div id="manualPointsError" className="invalid-feedback">
                      {errors.manualPoints.message}
                    </div>
                  )}
                  <small id="manualPointsHelp" className="form-text text-muted">
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
                type="button"
                className="btn btn-outline-primary"
                disabled={isSubmitting}
                onClick={handleSubmit(async (formData) => {
                  // Always fetch question data for new questions
                  let questionData: QuestionByQidResult;
                  try {
                    questionData = await trpcClient.questionByQid.query({ qid: formData.id! });
                  } catch {
                    setError('id', { message: 'Question not found' });
                    return;
                  }

                  // Filter out inherited values that were not modified
                  const filteredData = { ...formData };

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

                  // Preserve the trackingId from the original question
                  const dataWithTrackingId = {
                    ...filteredData,
                    trackingId: question.trackingId,
                  };

                  handleUpdateQuestion(
                    dataWithTrackingId as ZoneQuestionBlockForm | QuestionAlternativeForm,
                    questionData,
                  );

                  // After adding, open picker for next question
                  onAddAndPickAnother();
                })}
              >
                {isSubmitting ? 'Adding...' : 'Add & pick another'}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
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
