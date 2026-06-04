import { type ChangeEvent, useEffect, useRef } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import {
  get,
  useController,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS } from '../../../schemas/accessControl.js';

import { useAccessControlRuleEditable } from './AccessControlEditabilityContext.js';
import type { AccessControlFormData } from './types.js';

type AfterCompleteVisibilityMode =
  | 'show_questions_and_score'
  | 'show_score_only'
  | 'hide_questions_and_score';

const AFTER_COMPLETE_VISIBILITY_ITEMS: RichSelectItem<AfterCompleteVisibilityMode>[] = [
  {
    value: 'show_questions_and_score',
    label: 'Show questions and score',
    description:
      'Students see questions and their score after finishing while the reservation is still active',
  },
  {
    value: 'show_score_only',
    label: 'Show score only',
    description:
      'Students see their score but not the questions after finishing while the reservation is still active',
  },
  {
    value: 'hide_questions_and_score',
    label: 'Hide questions and score',
    description:
      'Students see neither questions nor score after finishing while the reservation is still active',
  },
];

function getAfterCompleteVisibilityMode(
  questionsHidden: boolean,
  scoreHidden: boolean,
): AfterCompleteVisibilityMode {
  if (!questionsHidden) return 'show_questions_and_score';
  if (!scoreHidden) return 'show_score_only';
  return 'hide_questions_and_score';
}

function ExamAfterCompleteFields({ index }: { index: number }) {
  const ruleEditable = useAccessControlRuleEditable();
  const { field: questionsHiddenField } = useController<
    AccessControlFormData,
    `defaultRule.prairieTestExams.${number}.afterCompleteQuestionsHidden`
  >({
    name: `defaultRule.prairieTestExams.${index}.afterCompleteQuestionsHidden`,
  });
  const { field: scoreHiddenField } = useController<
    AccessControlFormData,
    `defaultRule.prairieTestExams.${number}.afterCompleteScoreHidden`
  >({
    name: `defaultRule.prairieTestExams.${index}.afterCompleteScoreHidden`,
  });
  const readOnly = useWatch<
    AccessControlFormData,
    `defaultRule.prairieTestExams.${number}.readOnly`
  >({
    name: `defaultRule.prairieTestExams.${index}.readOnly`,
  });

  const mode = getAfterCompleteVisibilityMode(questionsHiddenField.value, scoreHiddenField.value);
  const selectedDescription = AFTER_COMPLETE_VISIBILITY_ITEMS.find(
    (item) => item.value === mode,
  )?.description;

  const handleModeChange = (newMode: AfterCompleteVisibilityMode) => {
    questionsHiddenField.onChange(newMode !== 'show_questions_and_score');
    scoreHiddenField.onChange(newMode === 'hide_questions_and_score');
  };

  return (
    <div className="mt-3">
      <Form.Label className="fw-bold" htmlFor={`defaultRule-exam-after-complete-${index}`}>
        After completion
      </Form.Label>
      <RichSelect
        items={AFTER_COMPLETE_VISIBILITY_ITEMS}
        value={mode}
        aria-label="After completion visibility during reservation"
        id={`defaultRule-exam-after-complete-${index}`}
        minWidth={300}
        disabled={!ruleEditable || readOnly}
        onChange={handleModeChange}
      />
      {!readOnly && selectedDescription && (
        <Form.Text className="text-muted d-block">{selectedDescription}</Form.Text>
      )}
      {readOnly && (
        <Form.Text className="text-muted d-block">
          Questions and scores are always shown during read-only reservations.
        </Form.Text>
      )}
    </div>
  );
}

export function PrairieTestControlForm() {
  const ruleEditable = useAccessControlRuleEditable();
  const { register, setValue, trigger } = useFormContext<AccessControlFormData>();

  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });

  const { errors } = useFormState();

  const watchedExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  const examsRef = useRef(watchedExams);
  examsRef.current = watchedExams;

  const watchedExamUuids = watchedExams.map((exam) => exam.examUuid).join('\0');
  const addExamDisabled = examFields.length >= MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS;
  const addExamDisabledTitle = addExamDisabled
    ? `A rule can have at most ${MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS} PrairieTest exams.`
    : undefined;

  // Validate when the number of exams changes, any UUID is edited, or on mount
  // so empty exam UUIDs (added by the PrairieTest checkbox in
  // IntegrationsSection) show errors immediately and duplicate detection
  // re-runs after add/remove/edit.
  useEffect(() => {
    void trigger('defaultRule.prairieTestExams');
  }, [examFields.length, watchedExamUuids, trigger]);

  const getExamUuidError = (index: number): string | undefined => {
    return get(errors, `defaultRule.prairieTestExams.${index}.examUuid`)?.message;
  };

  return (
    <div className="mt-2">
      {examFields.map((field, index) => (
        <div
          key={field.id}
          className="mb-3 border rounded p-3"
          style={{ borderColor: 'var(--bs-border-color)' }}
        >
          <Form.Group className="mb-3" controlId={`defaultRule-exam-uuid-${index}`}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <Form.Label className="mb-0">Exam UUID</Form.Label>
              {ruleEditable && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  aria-label={`Remove exam ${index + 1}`}
                  onClick={() => removeExam(index)}
                >
                  <i className="bi bi-trash me-1" aria-hidden="true" />
                  Remove
                </Button>
              )}
            </div>
            <Form.Control
              type="text"
              isInvalid={!!getExamUuidError(index)}
              aria-invalid={!!getExamUuidError(index)}
              aria-errormessage={
                getExamUuidError(index) ? `defaultRule-exam-uuid-${index}-error` : undefined
              }
              aria-describedby={`defaultRule-exam-uuid-${index}-help`}
              defaultValue=""
              disabled={!ruleEditable}
              placeholder="e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c"
              {...register(`defaultRule.prairieTestExams.${index}.examUuid`, {
                required: 'Exam UUID is required',
                pattern: {
                  value: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                  message: 'Invalid UUID format',
                },
                validate: (value) => {
                  const currentExams = examsRef.current;
                  for (let i = 0; i < currentExams.length; i++) {
                    if (i !== index && currentExams[i]?.examUuid === value) {
                      return 'Duplicate exam UUID';
                    }
                  }
                  return true;
                },
              })}
            />
            {getExamUuidError(index) && (
              <Form.Text
                id={`defaultRule-exam-uuid-${index}-error`}
                className="text-danger d-block"
                role="alert"
              >
                {getExamUuidError(index)}
              </Form.Text>
            )}
            <Form.Text id={`defaultRule-exam-uuid-${index}-help`} className="text-muted">
              You can find this UUID in the PrairieTest exam settings.
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Check
              type="checkbox"
              id={`defaultRule-exam-readonly-${index}`}
              label="Read-only mode"
              defaultChecked={false}
              disabled={!ruleEditable}
              {...register(`defaultRule.prairieTestExams.${index}.readOnly`, {
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.checked) {
                    setValue(
                      `defaultRule.prairieTestExams.${index}.afterCompleteQuestionsHidden`,
                      false,
                      { shouldDirty: true, shouldValidate: true },
                    );
                    setValue(
                      `defaultRule.prairieTestExams.${index}.afterCompleteScoreHidden`,
                      false,
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      },
                    );
                  }
                },
              })}
              aria-describedby={`defaultRule-exam-readonly-${index}-help`}
            />
            <Form.Text id={`defaultRule-exam-readonly-${index}-help`} className="text-muted">
              During a read-only reservation, students can view their previous submissions, but
              cannot submit new answers or start the assessment if they haven't already.
            </Form.Text>
          </Form.Group>
          <ExamAfterCompleteFields index={index} />
        </div>
      ))}
      {ruleEditable && (
        <>
          {addExamDisabledTitle && (
            <Alert variant="secondary" className="py-2 mb-2">
              {addExamDisabledTitle}
            </Alert>
          )}
          <Button
            size="sm"
            variant="outline-primary"
            disabled={addExamDisabled}
            title={addExamDisabledTitle}
            onClick={() => {
              appendExam({
                examUuid: '',
                readOnly: false,
                afterCompleteQuestionsHidden: false,
                afterCompleteScoreHidden: false,
              });
              // Trigger validation so the empty UUID error shows immediately.
              void trigger('defaultRule.prairieTestExams');
            }}
          >
            <i className="bi bi-plus-circle me-1" aria-hidden="true" />
            Add exam
          </Button>
        </>
      )}
    </div>
  );
}
