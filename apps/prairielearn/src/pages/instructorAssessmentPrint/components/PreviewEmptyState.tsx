/** Shown in place of the preview until the assessment has a form. */
export function PreviewEmptyState({
  canEditPrintForms,
  creatingInitialForm,
  initialFormFailed,
}: {
  canEditPrintForms: boolean;
  creatingInitialForm: boolean;
  initialFormFailed: boolean;
}) {
  return (
    <div className="print-preparation-empty">
      <i className="bi bi-file-earmark-text display-4 text-primary mb-3" aria-hidden="true" />
      <h3 className="h5">{canEditPrintForms ? 'Set up your first form' : 'No forms yet'}</h3>
      <p className="text-muted mb-0">
        {!canEditPrintForms
          ? 'Ask a course editor to create a form.'
          : creatingInitialForm
            ? 'Creating Form A1 and its preview.'
            : initialFormFailed
              ? 'Use Try again above to create Form A1.'
              : 'Choose your layout, then create a preview.'}
        {canEditPrintForms && (
          <>
            <br />
            Review the questions before downloading.
          </>
        )}
      </p>
    </div>
  );
}
