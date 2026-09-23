import { z } from 'zod';

const PREFIX = 'pl:print:1:';
const IdSchema = z.string().regex(/^[1-9]\d*$/);
const PayloadSchema = z.strictObject({
  c: IdSchema,
  a: IdSchema,
  i: IdSchema,
  p: z.number().int().positive(),
  u: z.tuple([IdSchema, z.string().min(1), z.string().nullable()]),
  t: z.iso.datetime(),
  d: z.enum(['exam', 'answer_key']),
  f: z.enum(['pdf', 'docx']),
  e: z.uuid(),
});

export interface PrintPageIdentity {
  courseId: string;
  assessmentId: string;
  assessmentInstanceId: string;
  pageNumber: number;
  generatedBy: { userId: string; uid: string; name: string | null };
  generatedAt: string;
  document: 'exam' | 'answer_key';
  format: 'pdf' | 'docx';
  exportId: string;
}

/** Compact keys keep the printed code readable; the prefix versions the wire format. */
export function encodePrintPageIdentity(identity: PrintPageIdentity): string {
  return (
    PREFIX +
    JSON.stringify(
      PayloadSchema.parse({
        c: identity.courseId,
        a: identity.assessmentId,
        i: identity.assessmentInstanceId,
        p: identity.pageNumber,
        u: [identity.generatedBy.userId, identity.generatedBy.uid, identity.generatedBy.name],
        t: identity.generatedAt,
        d: identity.document,
        f: identity.format,
        e: identity.exportId,
      }),
    )
  );
}

/** Validates scanned metadata. A valid code does not authenticate its contents or grant access. */
export function decodePrintPageIdentity(value: string): PrintPageIdentity {
  if (!value.startsWith(PREFIX)) throw new Error('Unsupported printable page QR code');
  const payload = PayloadSchema.parse(JSON.parse(value.slice(PREFIX.length)));
  return {
    courseId: payload.c,
    assessmentId: payload.a,
    assessmentInstanceId: payload.i,
    pageNumber: payload.p,
    generatedBy: { userId: payload.u[0], uid: payload.u[1], name: payload.u[2] },
    generatedAt: payload.t,
    document: payload.d,
    format: payload.f,
    exportId: payload.e,
  };
}
