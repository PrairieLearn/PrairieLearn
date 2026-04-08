import { useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import { get, useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

export function PrairieTestControlForm() {
  const { register, trigger } = useFormContext<AccessControlFormData>();

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
            <Form.Label>Exam UUID</Form.Label>
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
          <div className="d-flex align-items-start justify-content-between">
            <Form.Group>
              <Form.Check
                type="checkbox"
                id={`mainRule-exam-readonly-${index}`}
                label="Read-only mode"
                defaultChecked={false}
                {...register(`mainRule.prairieTestExams.${index}.readOnly`)}
                aria-describedby={`mainRule-exam-readonly-${index}-help`}
              />
              <Form.Text id={`mainRule-exam-readonly-${index}-help`} className="text-muted">
                Students can view but not submit answers
              </Form.Text>
            </Form.Group>
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
        </div>
      ))}
      <Button
        size="sm"
        variant="outline-primary"
        onClick={() => {
          appendExam({ examUuid: '', readOnly: false });
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
