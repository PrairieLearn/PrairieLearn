import clsx from 'clsx';
import { Button, Card } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffPrintPreparationForm } from '../../../lib/client/safe-db-types.js';

/** Lists current forms with their actions, and previous forms kept for reference. */
export function PrintFormsCard({
  activeForms,
  archivedForms,
  formId,
  showCurrentForms,
  canEditPrintForms,
  hasRandomization,
  groupWork,
  canAddForm,
  actionsDisabled,
  isDirty,
  onSwitchForm,
  onAddForm,
  onRegenerate,
  onArchive,
}: {
  activeForms: StaffPrintPreparationForm[];
  archivedForms: StaffPrintPreparationForm[];
  formId: string | null;
  showCurrentForms: boolean;
  canEditPrintForms: boolean;
  hasRandomization: boolean;
  groupWork: boolean;
  canAddForm: boolean;
  actionsDisabled: boolean;
  isDirty: boolean;
  onSwitchForm: (id: string) => void;
  onAddForm: () => void;
  onRegenerate: (form: StaffPrintPreparationForm) => void;
  onArchive: (form: StaffPrintPreparationForm) => void;
}) {
  return (
    <>
      {showCurrentForms && (
        <Card className="mb-3">
          <Card.Body>
            <h2 className="h6 mb-2">Print forms</h2>
            <p className="small text-muted">
              Each form can contain distinct randomized values, selected questions, and layout
              settings. Paper size is shared by all current forms. Select a form to preview it
              {canEditPrintForms
                ? ' or make changes.'
                : '. Ask a course editor to change forms or start a download.'}
            </p>
            <div className="d-flex flex-column gap-2" role="group" aria-label="Print forms">
              {activeForms.map((form) => {
                const { id, label } = form;
                return (
                  <div key={id} className="d-flex align-items-center gap-2">
                    <Button
                      id={`print-form-${id}`}
                      type="button"
                      size="sm"
                      className="flex-grow-1 text-start"
                      variant={id === formId ? 'primary' : 'outline-secondary'}
                      aria-pressed={id === formId}
                      disabled={actionsDisabled}
                      onClick={() => onSwitchForm(id)}
                    >
                      Form {label}
                      {id === formId && <span className="float-end">Previewing</span>}
                    </Button>
                    {canEditPrintForms &&
                      (form.has_randomizable_questions ||
                        form.question_selection_locked_at !== null) && (
                        <OverlayTrigger
                          placement="top"
                          tooltip={{
                            props: { id: `print-regenerate-${id}` },
                            body: form.has_randomizable_questions
                              ? `Regenerate Form ${label} with new randomization`
                              : `Create a new version of Form ${label} to change its questions`,
                          }}
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-secondary"
                            aria-label={`Regenerate Form ${label}`}
                            disabled={actionsDisabled || groupWork}
                            onClick={() => onRegenerate(form)}
                          >
                            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                          </Button>
                        </OverlayTrigger>
                      )}
                    {canEditPrintForms && (
                      <OverlayTrigger
                        placement="top"
                        tooltip={{
                          props: { id: `print-archive-${id}` },
                          body: `Archive Form ${label}`,
                        }}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-secondary"
                          aria-label={`Archive Form ${label}`}
                          disabled={activeForms.length === 1 || actionsDisabled}
                          onClick={() => onArchive(form)}
                        >
                          <i className="bi bi-archive" aria-hidden="true" />
                        </Button>
                      </OverlayTrigger>
                    )}
                  </div>
                );
              })}
            </div>
            {canEditPrintForms && hasRandomization && !groupWork && (
              <Button
                type="button"
                variant="outline-primary"
                size="sm"
                className={clsx('mt-3', { disabled: !canAddForm })}
                aria-disabled={!canAddForm}
                onClick={() => {
                  if (canAddForm) onAddForm();
                }}
              >
                <i className="bi bi-plus-lg me-2" aria-hidden="true" /> Add form
              </Button>
            )}
            {isDirty && (
              <p className="small text-muted mt-2 mb-0">
                Save your changes before switching forms.
              </p>
            )}
          </Card.Body>
        </Card>
      )}
      {archivedForms.length > 0 && (
        <Card className="mb-3">
          <Card.Body>
            <details>
              <summary className="h6 mb-0">Previous forms ({archivedForms.length})</summary>
              <p className="small text-muted mt-2 mb-2">
                Earlier versions of exported forms and archived forms are kept here for reference.
                Select a previous form to view its layout settings, question selections, and print
                preview.
              </p>
              <div className="d-flex flex-column gap-2">
                {archivedForms.map((form) => (
                  <Button
                    key={form.id}
                    type="button"
                    size="sm"
                    variant={form.id === formId ? 'secondary' : 'outline-secondary'}
                    className="text-start"
                    aria-pressed={form.id === formId}
                    disabled={actionsDisabled}
                    onClick={() => onSwitchForm(form.id)}
                  >
                    Form {form.label}
                    {form.id === formId && <span className="float-end">Previewing</span>}
                  </Button>
                ))}
              </div>
            </details>
          </Card.Body>
        </Card>
      )}
    </>
  );
}
