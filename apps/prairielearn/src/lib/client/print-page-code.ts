import { z } from 'zod';

const PREFIX = 'PL:PRINT:V1:';
const IdSchema = z.string().regex(/^[1-9]\d*$/);
const IdentitySchema = z.strictObject({
  assessmentInstanceId: IdSchema,
  pageNumber: z.number().int().positive(),
  document: z.enum(['exam', 'answer_key']),
  format: z.enum(['pdf', 'docx']),
  exportId: z.uuid(),
});

export type PrintPageIdentity = z.infer<typeof IdentitySchema>;

/** Use QR's alphanumeric mode to keep the printed code large enough to scan. */
export function encodePrintPageIdentity(identity: PrintPageIdentity): string {
  const value = IdentitySchema.parse(identity);
  return [
    PREFIX.slice(0, -1),
    value.assessmentInstanceId,
    value.pageNumber,
    value.document === 'exam' ? 'E' : 'K',
    value.format === 'pdf' ? 'P' : 'W',
    value.exportId.replaceAll('-', '').toUpperCase(),
  ].join(':');
}

/** Validates scanned metadata. A valid code does not authenticate its contents or grant access. */
export function decodePrintPageIdentity(value: string): PrintPageIdentity {
  if (!value.startsWith(PREFIX)) throw new Error('Unsupported printable page QR code');
  const match = /^PL:PRINT:V1:([1-9]\d*):([1-9]\d*):([EK]):([PW]):([A-F0-9]{32})$/.exec(value);
  if (!match) throw new Error('Invalid printable page QR code');
  const hex = match[5].toLowerCase();
  return IdentitySchema.parse({
    assessmentInstanceId: match[1],
    pageNumber: Number(match[2]),
    document: match[3] === 'E' ? 'exam' : 'answer_key',
    format: match[4] === 'P' ? 'pdf' : 'docx',
    exportId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  });
}
