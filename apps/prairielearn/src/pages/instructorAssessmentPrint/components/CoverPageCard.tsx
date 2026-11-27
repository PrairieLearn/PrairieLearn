import clsx from 'clsx';
import { filesize } from 'filesize';
import { type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { Button, Card, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import { PrintIdentityFieldsTextSchema } from '../../../lib/client/printing/print-cover.js';
import {
  MAX_COVER_BYTES,
  MAX_COVER_FILES,
  MAX_COVER_PAGES,
} from '../../../lib/client/printing/print-packet.js';
import type { PrintSettings, SavePrintSetting } from '../../../lib/printing/print-settings.js';

const COVER_SIZE_LIMIT = filesize(MAX_COVER_BYTES, { base: 10 });

export interface CoverPageFile {
  id: string;
  file: File;
}

/** Default cover options and the PDFs uploaded for student copies, which stay in this tab. */
export function CoverPageCard({
  settings,
  settingsLocked,
  controlsBusy,
  canEditPrintForms,
  coverPages,
  setCoverPages,
  uploadError,
  setUploadError,
  saveSetting,
}: {
  settings: PrintSettings;
  settingsLocked: boolean;
  controlsBusy: boolean;
  canEditPrintForms: boolean;
  coverPages: CoverPageFile[];
  setCoverPages: Dispatch<SetStateAction<CoverPageFile[]>>;
  uploadError: string | null;
  setUploadError: (error: string | null) => void;
  saveSetting: SavePrintSetting;
}) {
  const {
    register,
    handleSubmit,
    formState: { dirtyFields, errors },
  } = useFormContext<PrintSettings>();
  return (
    <Card className="mb-3">
      <Card.Body>
        <h2 className="h6 mb-3">Cover page</h2>
        <Form.Check
          id="print-include-cover"
          type="checkbox"
          className="mb-3"
          label="Include default cover page"
          defaultChecked={settings.includeCoverPage}
          disabled={settingsLocked}
          {...register('includeCoverPage', {
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              void saveSetting('includeCoverPage', event.target.checked).catch(() => {});
            },
          })}
        />
        {settings.includeCoverPage && (
          <Form.Group controlId="print-identity-fields">
            <Form.Label>Additional student fields:</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              defaultValue={settings.identityFields}
              disabled={settingsLocked}
              aria-describedby="print-identity-help"
              aria-invalid={!!errors.identityFields}
              aria-errormessage={errors.identityFields ? 'print-identity-error' : undefined}
              isInvalid={!!errors.identityFields}
              {...register('identityFields', {
                validate: (value) => {
                  const result = PrintIdentityFieldsTextSchema.safeParse(value);
                  return result.success || result.error.issues[0].message;
                },
              })}
            />
            <Form.Control.Feedback type="invalid" id="print-identity-error">
              {errors.identityFields?.message}
            </Form.Control.Feedback>
            <Form.Text id="print-identity-help">
              One label per line. Name and Date are always included. Instructions come from the
              assessment.
            </Form.Text>
            {canEditPrintForms && (
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  className={clsx({
                    disabled: settingsLocked || !dirtyFields.identityFields,
                  })}
                  aria-disabled={settingsLocked || !dirtyFields.identityFields}
                  onClick={() => {
                    if (settingsLocked || !dirtyFields.identityFields) return;
                    void handleSubmit(async (values) => {
                      await saveSetting('identityFields', values.identityFields);
                    })().catch(() => {});
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </Form.Group>
        )}
        {settings.includeCoverPage && (
          <Form.Check
            id="print-grading-table"
            className="mt-3"
            label="Include grading table"
            defaultChecked={settings.includeGradingTable}
            disabled={settingsLocked}
            {...register('includeGradingTable', {
              onChange: (event: ChangeEvent<HTMLInputElement>) => {
                void saveSetting('includeGradingTable', event.target.checked).catch(() => {});
              },
            })}
          />
        )}
        {settings.includeCoverPage && (
          <div className="mt-3">
            <Form.Check
              id="print-honor-code"
              label="Include honor code"
              aria-describedby="print-honor-code-help"
              defaultChecked={settings.includeHonorCode}
              disabled={settingsLocked}
              {...register('includeHonorCode', {
                onChange: (event: ChangeEvent<HTMLInputElement>) => {
                  void saveSetting('includeHonorCode', event.target.checked).catch(() => {});
                },
              })}
            />
            <Form.Text id="print-honor-code-help">
              Uses the assessment’s honor code, or the default honor code if none is configured.
            </Form.Text>
          </div>
        )}
        <Form.Group controlId="print-cover-pages" className="mt-3" hidden={!canEditPrintForms}>
          <Form.Label>Custom cover pages (PDF)</Form.Label>
          <Form.Control
            type="file"
            accept="application/pdf,.pdf"
            disabled={controlsBusy || !canEditPrintForms}
            aria-describedby="print-cover-pages-help"
            aria-invalid={!!uploadError}
            aria-errormessage={uploadError ? 'print-cover-pages-error' : undefined}
            isInvalid={!!uploadError}
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = [
                ...coverPages,
                ...Array.from(event.target.files ?? [], (file) => ({
                  id: crypto.randomUUID(),
                  file,
                })),
              ];
              event.target.value = '';
              if (next.some(({ file }) => !file.name.toLowerCase().endsWith('.pdf'))) {
                setUploadError(
                  'Files were not added. Choose PDF files for your custom cover pages.',
                );
              } else if (
                next.length > MAX_COVER_FILES ||
                next.reduce((sum, { file }) => sum + file.size, 0) > MAX_COVER_BYTES
              ) {
                setUploadError(
                  `Files were not added. Use up to ${MAX_COVER_FILES} PDFs, totaling no more than ${COVER_SIZE_LIMIT}.`,
                );
              } else {
                setCoverPages(next);
                setUploadError(null);
              }
            }}
          />
          <Form.Control.Feedback type="invalid" id="print-cover-pages-error">
            {uploadError}
          </Form.Control.Feedback>
          <Form.Text id="print-cover-pages-help">
            Every student copy includes all uploaded pages, in this order, before the questions
            {settings.includeCoverPage ? ' and after the default cover' : ''}. Answer keys and Word
            files exclude uploaded pages. Up to {MAX_COVER_FILES} PDFs, {COVER_SIZE_LIMIT} total,
            and {MAX_COVER_PAGES} pages.
          </Form.Text>
        </Form.Group>
        {canEditPrintForms && coverPages.length > 0 && (
          <>
            <ol className="small ps-3 mt-2 mb-1">
              {coverPages.map(({ id, file }) => (
                <li key={id}>
                  <div className="d-flex align-items-center gap-2">
                    <span className="text-break flex-grow-1">{file.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      aria-label={`Remove cover ${file.name}`}
                      disabled={controlsBusy}
                      onClick={() =>
                        setCoverPages((files) => files.filter((cover) => cover.id !== id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="small text-muted mb-0">
              Uploaded PDFs are temporary. Closing or reloading this page before a student-copy PDF
              is ready will discard them. Check the downloaded file to see how the pages appear.
            </p>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
