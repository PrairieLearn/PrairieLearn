import clsx from 'clsx';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { QuestionAlternativeForm, ZoneQuestionBlockForm } from '../types.js';
import { validatePositiveInteger } from '../utils/questions.js';

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
    }
  | {
      type: 'create-group';
      group: ZoneQuestionBlockForm;
    }
  | {
      type: 'edit-group';
      group: ZoneQuestionBlockForm;
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
  handleUpdateGroup,
  assessmentType,
  onPickQuestion,
  onAddAndPickAnother,
}: {
  show: boolean;
  data: EditQuestionModalData | null;
  onHide: () => void;
  onExited?: () => void;
  handleUpdateQuestion: (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    newQuestionData: StaffAssessmentQuestionRow | undefined,
  ) => void;
  handleUpdateGroup?: (group: ZoneQuestionBlockForm) => void;
  assessmentType: 'Homework' | 'Exam';
  onPickQuestion?: (currentFormValues: ZoneQuestionBlockForm | QuestionAlternativeForm) => void;
  onAddAndPickAnother?: () => void;
}) {
  const type = data?.type ?? null;
  const isGroupMode = type === 'create-group' || type === 'edit-group';
  const question = data && (data.type === 'create' || data.type === 'edit') ? data.question : null;
  const group =
    data && (data.type === 'create-group' || data.type === 'edit-group') ? data.group : null;
  const zoneQuestionBlock =
    data && (data.type === 'create' || data.type === 'edit') ? data.zoneQuestionBlock : undefined;
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

  // If in group mode, render the group editing form
  if (isGroupMode && group) {
    return (
      <EditAlternativeGroupForm
        show={show}
        type={type}
        group={group}
        handleUpdateGroup={handleUpdateGroup!}
        assessmentType={assessmentType}
        onHide={onHide}
      />
    );
  }

  // Shared submission logic for both "Save" and "Add & pick another" buttons
  const submitQuestion = async (
    formData: ZoneQuestionBlockForm | QuestionAlternativeForm,
    options: { alwaysFetch?: boolean } = {},
  ): Promise<boolean> => {
    // Fetch question data if creating, QID changed, or alwaysFetch is true
    let questionData: StaffAssessmentQuestionRow | undefined;
    if (options.alwaysFetch || type === 'create' || formData.id !== (originalQuestionId ?? question?.id)) {
      const params = new URLSearchParams({ qid: formData.id! });
      const res = await fetch(`${window.location.pathname}/question.json?${params}`);
      if (!res.ok) {
        const data = await res.json();
        setError('id', { message: data.error ?? 'Failed to fetch question data' });
        return false;
      }
      const data = await res.json();
      if (data === null) {
        setError('id', { message: 'Question not found' });
        return false;
      }
      questionData = data;
    }

    // Filter out inherited values that were not modified
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

    handleUpdateQuestion(
      { ...filteredData, trackingId: question?.trackingId } as
        | ZoneQuestionBlockForm
        | QuestionAlternativeForm,
      questionData,
    );
    return true;
  };

  return (
    <Modal show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>{type === 'create' ? 'Add question' : 'Edit question'}</Modal.Title>
      </Modal.Header>
      {question && (
        <form
          onSubmit={handleSubmit(async (formData) => {
            await submitQuestion(formData);
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
                  const success = await submitQuestion(formData, { alwaysFetch: true });
                  if (success) {
                    onAddAndPickAnother();
                  }
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

/**
 * Form component for editing alternative groups.
 * Shows numberChoose and shared defaults (points, maxPoints).
 */
function EditAlternativeGroupForm({
  show,
  type,
  group,
  onHide,
  handleUpdateGroup,
  assessmentType,
}: {
  show: boolean;
  type: 'create-group' | 'edit-group';
  group: ZoneQuestionBlockForm;
  onHide: () => void;
  handleUpdateGroup: (group: ZoneQuestionBlockForm) => void;
  assessmentType: 'Homework' | 'Exam';
}) {
  const formValues = useMemo<ZoneQuestionBlockForm>(() => group, [group]);

  // Determine which property was originally set (points vs autoPoints)
  const originalPointsProperty = useMemo<'points' | 'autoPoints'>(() => {
    if (group.points != null) return 'points';
    if (group.autoPoints != null) return 'autoPoints';
    return 'autoPoints';
  }, [group]);

  // Determine which property was originally set (maxPoints vs maxAutoPoints)
  const originalMaxProperty = useMemo<'maxPoints' | 'maxAutoPoints'>(() => {
    if (group.maxAutoPoints != null) return 'maxAutoPoints';
    if (group.maxPoints != null) return 'maxPoints';
    return originalPointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
  }, [group, originalPointsProperty]);

  const autoPointsDisplayValue = group[originalPointsProperty] ?? undefined;
  const maxAutoPointsDisplayValue = group[originalMaxProperty] ?? undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ZoneQuestionBlockForm>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    values: formValues,
  });

  const modalTitle = type === 'create-group' ? 'Add alternative group' : 'Edit alternative group';
  const submitLabel =
    type === 'create-group'
      ? isSubmitting
        ? 'Adding...'
        : 'Add group'
      : isSubmitting
        ? 'Updating...'
        : 'Update group';

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{modalTitle}</Modal.Title>
      </Modal.Header>
      <form
        onSubmit={handleSubmit((formData) => {
          const updatedGroup: ZoneQuestionBlockForm = {
            ...formData,
            trackingId: group.trackingId,
            // Ensure alternatives array exists (may be empty for new groups)
            alternatives: group.alternatives ?? [],
          };
          handleUpdateGroup(updatedGroup);
        })}
      >
        <Modal.Body>
          <div className="mb-3">
            <label htmlFor="numberChooseInput">Number to choose</label>
            <input
              type="number"
              className={clsx('form-control', errors.numberChoose && 'is-invalid')}
              id="numberChooseInput"
              aria-invalid={!!errors.numberChoose}
              aria-errormessage={errors.numberChoose ? 'numberChooseError' : undefined}
              aria-describedby="numberChooseHelp"
              {...register('numberChoose', {
                value: group.numberChoose ?? 1,
                setValueAs: (value) => {
                  if (value === '') return undefined;
                  return Number(value);
                },
                validate: (value) => {
                  if (value !== undefined && value < 1) {
                    return 'Number to choose must be at least 1.';
                  }
                  if (value !== undefined && !Number.isInteger(value)) {
                    return 'Number to choose must be an integer.';
                  }
                  return true;
                },
              })}
            />
            {errors.numberChoose && (
              <div id="numberChooseError" className="invalid-feedback">
                {errors.numberChoose.message}
              </div>
            )}
            <small id="numberChooseHelp" className="form-text text-muted">
              The number of questions to choose from this group. Leave empty or set to the total
              number of alternatives to include all.
            </small>
          </div>

          <hr />
          <p className="text-muted small">
            <strong>Shared defaults:</strong> These values are inherited by alternatives in this
            group unless they specify their own.
          </p>

          {assessmentType === 'Homework' ? (
            <>
              <div className="mb-3">
                <label htmlFor="groupAutoPointsInput">Auto points</label>
                <input
                  type="number"
                  className="form-control"
                  id="groupAutoPointsInput"
                  step="any"
                  aria-describedby="groupAutoPointsHelp"
                  {...register(originalPointsProperty, {
                    value: autoPointsDisplayValue,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                  })}
                />
                <small id="groupAutoPointsHelp" className="form-text text-muted">
                  Default auto points for alternatives in this group.
                </small>
              </div>
              <div className="mb-3">
                <label htmlFor="groupMaxAutoPointsInput">Max auto points</label>
                <input
                  type="number"
                  className="form-control"
                  id="groupMaxAutoPointsInput"
                  aria-describedby="groupMaxPointsHelp"
                  {...register(originalMaxProperty, {
                    value: maxAutoPointsDisplayValue,
                    setValueAs: (value) => {
                      if (value === '') return undefined;
                      return Number(value);
                    },
                  })}
                />
                <small id="groupMaxPointsHelp" className="form-text text-muted">
                  Default max auto points for alternatives in this group.
                </small>
              </div>
            </>
          ) : (
            <div className="mb-3">
              <label htmlFor="groupPointsInput">Points list</label>
              <input
                type="text"
                className={clsx(
                  'form-control points-list',
                  errors[originalPointsProperty] && 'is-invalid',
                )}
                id="groupPointsInput"
                aria-describedby="groupPointsHelp"
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
                })}
              />
              {errors[originalPointsProperty] && (
                <div className="invalid-feedback">{errors[originalPointsProperty].message}</div>
              )}
              <small id="groupPointsHelp" className="form-text text-muted">
                Default points for alternatives in this group.
              </small>
            </div>
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
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {submitLabel}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
