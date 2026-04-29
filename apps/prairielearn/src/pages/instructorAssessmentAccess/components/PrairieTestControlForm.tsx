import { type ChangeEvent, useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import {
  get,
  useController,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

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
    description: 'Students see their score but not the questions while the reservation is active',
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
  const { field: questionsHiddenField } = useController<
    AccessControlFormData,
    `mainRule.prairieTestExams.${number}.afterCompleteQuestionsHidden`
  >({
    name: `mainRule.prairieTestExams.${index}.afterCompleteQuestionsHidden`,
  });
  const { field: scoreHiddenField } = useController<
    AccessControlFormData,
    `mainRule.prairieTestExams.${number}.afterCompleteScoreHidden`
  >({
    name: `mainRule.prairieTestExams.${index}.afterCompleteScoreHidden`,
  });
  const readOnly = useWatch<AccessControlFormData, `mainRule.prairieTestExams.${number}.readOnly`>({
    name: `mainRule.prairieTestExams.${index}.readOnly`,
  });

  const mode = getAfterCompleteVisibilityMode(questionsHiddenField.value, scoreHiddenField.value);

  const handleModeChange = (newMode: AfterCompleteVisibilityMode) => {
    questionsHiddenField.onChange(newMode !== 'show_questions_and_score');
    scoreHiddenField.onChange(newMode === 'hide_questions_and_score');
  };

  return (
    <div className="mt-3">
      <Form.Label className="fw-bold" htmlFor={`mainRule-exam-after-complete-${index}`}>
        After completion (during reservation)
      </Form.Label>
      <RichSelect
        items={AFTER_COMPLETE_VISIBILITY_ITEMS}
        value={mode}
        aria-label="After completion visibility during reservation"
        id={`mainRule-exam-after-complete-${index}`}
        minWidth={300}
        disabled={readOnly}
        onChange={handleModeChange}
      />
      {readOnly && (
        <Form.Text className="text-muted d-block mt-2">
          Read-only reservations have no completion state, so these settings don't apply.
        </Form.Text>
      )}
    </div>
  );
}

export function PrairieTestControlForm() {
  const { register, setValue, trigger } = useFormContext<AccessControlFormData>();

  const {
    fields: examFields,
    append: appendExam,
    remove: removeExam,
  } = useFieldArray<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });

  const { errors } = useFormState();

  const watchedExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  const examsRef = useRef(watchedExams);
  examsRef.current = watchedExams;

  const watchedExamUuids = watchedExams.map((exam) => exam.examUuid).join('\0');

  // Validate when the number of exams changes, any UUID is edited, or on mount
  // so empty exam UUIDs (added by the PrairieTest checkbox in
  // IntegrationsSection) show errors immediately and duplicate detection
  // re-runs after add/remove/edit.
  useEffect(() => {
    void trigger('mainRule.prairieTestExams');
  }, [examFields.length, watchedExamUuids, trigger]);

  const getExamUuidError = (index: number): string | undefined => {
    return get(errors, `mainRule.prairieTestExams.${index}.examUuid`)?.message;
  };

  return (
    <div>
      {examFields.map((field, index) => (
        <div
          key={field.id}
          className="mb-3 border rounded p-3"
          style={{ borderColor: 'var(--bs-border-color)' }}
        >
          <Form.Group className="mb-3" controlId={`mainRule-exam-uuid-${index}`}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <Form.Label className="mb-0">Exam UUID</Form.Label>
              <Button
                size="sm"
                variant="outline-danger"
                aria-label={`Remove exam ${index + 1}`}
                onClick={() => removeExam(index)}
              >
                <i className="bi bi-trash me-1" aria-hidden="true" />
                Remove
              </Button>
            </div>
            <Form.Control
              type="text"
              isInvalid={!!getExamUuidError(index)}
              aria-invalid={!!getExamUuidError(index)}
              aria-errormessage={
                getExamUuidError(index) ? `mainRule-exam-uuid-${index}-error` : undefined
              }
              aria-describedby={`mainRule-exam-uuid-${index}-help`}
              defaultValue=""
              placeholder="e.g., 11e89892-3eff-4d7f-90a2-221372f14e5c"
              {...register(`mainRule.prairieTestExams.${index}.examUuid`, {
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
                id={`mainRule-exam-uuid-${index}-error`}
                className="text-danger d-block"
                role="alert"
              >
                {getExamUuidError(index)}
              </Form.Text>
            )}
            <Form.Text id={`mainRule-exam-uuid-${index}-help`} className="text-muted">
              You can find this UUID in the PrairieTest exam settings
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Check
              type="checkbox"
              id={`mainRule-exam-readonly-${index}`}
              label="Read-only mode"
              defaultChecked={false}
              {...register(`mainRule.prairieTestExams.${index}.readOnly`, {
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.checked) {
                    setValue(
                      `mainRule.prairieTestExams.${index}.afterCompleteQuestionsHidden`,
                      false,
                      { shouldDirty: true, shouldValidate: true },
                    );
                    setValue(`mainRule.prairieTestExams.${index}.afterCompleteScoreHidden`, false, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                },
              })}
              aria-describedby={`mainRule-exam-readonly-${index}-help`}
            />
            <Form.Text id={`mainRule-exam-readonly-${index}-help`} className="text-muted">
              Students can view but not submit answers
            </Form.Text>
          </Form.Group>
          <ExamAfterCompleteFields index={index} />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline-primary"
        onClick={() => {
          appendExam({
            examUuid: '',
            readOnly: false,
            afterCompleteQuestionsHidden: false,
            afterCompleteScoreHidden: false,
          });
          // Trigger validation so the empty UUID error shows immediately.
          void trigger('mainRule.prairieTestExams');
        }}
      >
        <i className="bi bi-plus-circle me-1" aria-hidden="true" />
        Add exam
      </Button>
    </div>
  );
}
