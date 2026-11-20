import { type ChangeEvent } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import type { PrintSettings, SavePrintSetting } from '../../../lib/printing/print-settings.js';
import type { QuestionBlockSize } from '../../../lib/printing/question-block-size.js';

export const BLOCK_SIZE_LABELS: Record<QuestionBlockSize, string> = {
  auto: 'Fit to content',
  third: 'One third of a page',
  half: 'Half a page',
  full: 'A full page',
};

export function PaperLayoutCard({
  settings,
  settingsLocked,
  mixedPaperSizes,
  canEditPrintForms,
  isPreviousForm,
  onChangePaperSize,
  saveSetting,
}: {
  settings: PrintSettings;
  settingsLocked: boolean;
  mixedPaperSizes: boolean;
  canEditPrintForms: boolean;
  isPreviousForm: boolean;
  onChangePaperSize: (paperSize: PrintSettings['paperSize']) => void;
  saveSetting: SavePrintSetting;
}) {
  const { register } = useFormContext<PrintSettings>();
  return (
    <Card className="mb-3">
      <Card.Body>
        <h2 className="h6 mb-3">Paper and layout</h2>
        <Form.Group controlId="print-paper-size" className="mb-3">
          <Form.Label>Paper size</Form.Label>
          <Form.Select
            defaultValue={settings.paperSize}
            disabled={settingsLocked}
            {...register('paperSize', {
              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                onChangePaperSize(event.target.value as PrintSettings['paperSize']);
              },
            })}
          >
            <option value="Letter">US Letter · 8.5 × 11 in</option>
            <option value="A4">A4 · 210 × 297 mm</option>
          </Form.Select>
          <Form.Text>
            This size applies to all current forms. Previous forms keep their saved size.
          </Form.Text>
          {mixedPaperSizes && (
            <Alert variant="warning" className="mt-2 mb-0 small">
              Current forms use different paper sizes.{' '}
              {!canEditPrintForms ? (
                'Ask a course editor to apply one size to all current forms.'
              ) : isPreviousForm ? (
                'Select a current form to apply one size to all forms.'
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline-warning"
                  disabled={settingsLocked}
                  onClick={() => onChangePaperSize(settings.paperSize)}
                >
                  Apply {settings.paperSize} to all current forms
                </Button>
              )}
            </Alert>
          )}
        </Form.Group>
        <Form.Group controlId="print-block-size">
          <Form.Label>Space per question</Form.Label>
          <Form.Select
            defaultValue={settings.blockSize}
            disabled={settingsLocked}
            {...register('blockSize', {
              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                void saveSetting(
                  'blockSize',
                  event.target.value as PrintSettings['blockSize'],
                ).catch(() => {});
              },
            })}
          >
            {Object.entries(BLOCK_SIZE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Form.Select>
          <Form.Text>
            Reserve room for written work. Individual questions can override this below.
          </Form.Text>
        </Form.Group>
      </Card.Body>
    </Card>
  );
}
