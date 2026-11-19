import { TRPCError } from '@trpc/server';
import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  getCounter,
  getHistogram,
  instrumentedWithMetrics,
  metrics,
} from '@prairielearn/opentelemetry';
import { IdSchema, JsonFromStringSchema, parseRequestBody } from '@prairielearn/zod';

import { features } from '../../lib/features/index.js';
import { parseSubmissionBody } from '../../lib/question-submission.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { canCollectUnsavedSubmissions } from '../../lib/unsaved-submissions.js';
import {
  deleteUnsavedSubmission,
  selectUnsavedSubmissionGeneration,
  upsertUnsavedSubmission,
} from '../../models/unsaved-submission.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

import { requireInstanceQuestionEdit, t } from './init.js';

/** @knipignore */
export interface UnsavedSubmissionsError {
  upsert: never;
  generation: never;
}

const meter = metrics.getMeter('prairielearn');
const GenerationSchema = z.number().int().nonnegative();
const SubmissionSchema = z.object({
  variant_id: IdSchema,
  submitted_answer: z.record(z.string(), z.unknown()),
});
const CalculationSubmissionSchema = JsonFromStringSchema.pipe(
  z.object({
    variant: z.object({ id: IdSchema }),
    submittedAnswer: SubmissionSchema.shape.submitted_answer,
  }),
).transform(({ variant, submittedAnswer }) => ({
  variant_id: variant.id,
  submitted_answer: submittedAnswer,
}));

// Student ownership is checked by the instance-question permission middleware.
// oxlint-disable-next-line @prairielearn/require-trpc-permission-middleware
const upsert = t.procedure
  .use(requireInstanceQuestionEdit)
  .input(
    z.object({
      uuid: z.uuid(),
      generation: GenerationSchema,
      formData: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (
      !canCollectUnsavedSubmissions(ctx.locals) ||
      !(await features.enabledFromLocals('unsaved-submissions-collection', ctx.locals))
    ) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Unsaved submissions are not available' });
    }

    const parsed =
      ctx.question.type === 'Freeform'
        ? SubmissionSchema.safeParse(parseSubmissionBody(input.formData, ctx.question.type))
        : CalculationSubmissionSchema.safeParse(input.formData.postData);
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid submission data' });
    }
    const { variant_id, submitted_answer } = parsed.data;
    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: variant_id,
      variant_course: ctx.course,
      question_id: ctx.question.id,
      course_instance_id: ctx.course_instance.id,
      instance_question_id: ctx.instance_question.id,
      authz_data: ctx.locals.authz_data,
      authn_user: ctx.authn_user,
      user: ctx.user,
      is_administrator: ctx.locals.is_administrator,
    });
    if (!variant.open || variant.broken_at !== null) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Variant is not open' });
    }

    getHistogram(meter, 'unsaved_submissions.payload_bytes', { unit: 'By' }).record(
      Buffer.byteLength(JSON.stringify(submitted_answer)),
    );
    const saved = await instrumentedWithMetrics(meter, 'unsaved_submissions.capture', () =>
      upsertUnsavedSubmission({
        variant_id: variant.id,
        instance_question_id: ctx.instance_question.id,
        user_id: ctx.user.id,
        credit: ctx.authz_result.credit,
        raw_submitted_answer: submitted_answer,
        uuid: input.uuid,
        generation: input.generation,
      }),
    );
    getCounter(meter, 'unsaved_submissions.captures').add(1, { saved });
    return { saved };
  });

// Student ownership is checked by the instance-question permission middleware.
// oxlint-disable-next-line @prairielearn/require-trpc-permission-middleware
const generation = t.procedure.use(requireInstanceQuestionEdit).query(async ({ ctx }) => {
  if (
    !canCollectUnsavedSubmissions(ctx.locals) ||
    !(await features.enabledFromLocals('unsaved-submissions-collection', ctx.locals))
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Unsaved submissions are not available' });
  }
  return await selectUnsavedSubmissionGeneration({
    instance_question_id: ctx.instance_question.id,
    user_id: ctx.user.id,
  });
});

export const unsavedSubmissionsRouter = t.router({ upsert, generation });

const PostBodySchema = z.object({
  uuid: z.uuid(),
  generation: z.coerce.number().int().nonnegative(),
});

export const unsavedSubmissionDiscardRouter = Router({ mergeParams: true });
unsavedSubmissionDiscardRouter.post(
  '/',
  typedAsyncHandler<'instance-question'>(async (req, res) => {
    const body = parseRequestBody(req, PostBodySchema);
    if (!res.locals.authz_result.authorized_edit) {
      throw new HttpStatusError(403, 'Not authorized');
    }
    if (!(await features.enabledFromLocals('unsaved-submissions-collection', res.locals))) {
      throw new HttpStatusError(403, 'Unsaved submissions are not available');
    }
    // Timer-driven navigation at expiry must retain drafts for later recovery.
    if (canCollectUnsavedSubmissions(res.locals)) {
      await deleteUnsavedSubmission({
        instance_question_id: res.locals.instance_question.id,
        user_id: res.locals.user.id,
        uuid: body.uuid,
        generation: body.generation,
      });
      getCounter(meter, 'unsaved_submissions.discards').add(1);
    }
    res.sendStatus(204);
  }),
);
