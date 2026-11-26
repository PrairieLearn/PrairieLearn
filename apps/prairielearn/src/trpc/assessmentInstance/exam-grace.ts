import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { createExamGraceContext } from '../../lib/exam-grace-context.js';
import {
  beginExamGraceSave,
  finishExamGracePeriod,
  getExamGraceStatus,
  saveExamGraceSubmission,
} from '../../lib/exam-grace.js';
import { features } from '../../lib/features/index.js';
import { getClientFingerprintId } from '../../middlewares/clientFingerprint.js';
import { getCurrentRequestDate, getRequestReceivedDate } from '../../middlewares/date.js';

import { requireAssessmentInstanceAccess, requireExamGraceCapability, t } from './init.js';

async function action<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (err) {
    if (err instanceof HttpStatusError) {
      throw new TRPCError({
        code: err.status === 400 ? 'BAD_REQUEST' : err.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
        message: err.message,
        cause: err,
      });
    }
    throw err;
  }
}

const context = t.procedure
  .use(async ({ ctx, next }) => {
    if (!(await features.enabledFromLocals('exam-grace-period', ctx.locals))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Exam grace periods are not available' });
    }
    return next();
  })
  .use(requireAssessmentInstanceAccess)
  .query(async ({ ctx }) =>
    action(async () => {
      const grant = await createExamGraceContext(ctx.assessmentInstanceLocals);
      if (!grant) throw new TRPCError({ code: 'FORBIDDEN', message: 'No timed exam is available' });
      return grant;
    }),
  );

// The signed capability and fresh ownership checks permit only this expiry-specific workflow.
const graceProcedure = t.procedure
  .input(z.object({ token: z.string() }))
  .use(requireExamGraceCapability);

const status = graceProcedure.query(async ({ ctx }) =>
  getExamGraceStatus(ctx.grace, getCurrentRequestDate(ctx.locals)),
);

const beginSave = graceProcedure
  .input(z.object({ variantId: IdSchema }))
  .mutation(async ({ input, ctx }) =>
    action(() =>
      beginExamGraceSave({
        context: ctx.grace,
        variantId: input.variantId,
        receivedAt: getRequestReceivedDate(ctx.locals),
        now: () => getCurrentRequestDate(ctx.locals),
      }),
    ),
  );

const save = graceProcedure
  .input(
    z.object({
      saveId: z.uuid(),
      formData: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    }),
  )
  .mutation(async ({ input, ctx }) =>
    action(async () => {
      const clientFingerprintId = await getClientFingerprintId(ctx.req, ctx.res);
      return await saveExamGraceSubmission({
        context: ctx.grace,
        saveId: input.saveId,
        formData: input.formData,
        now: getCurrentRequestDate(ctx.locals),
        clientFingerprintId,
        course: ctx.course,
      });
    }),
  );

const finish = graceProcedure.mutation(async ({ ctx }) =>
  action(async () => {
    const clientFingerprintId = await getClientFingerprintId(ctx.req, ctx.res);
    return await finishExamGracePeriod({
      context: ctx.grace,
      now: () => getCurrentRequestDate(ctx.locals),
      clientFingerprintId,
    });
  }),
);

export const examGraceRouter = t.router({ context, status, beginSave, save, finish });
